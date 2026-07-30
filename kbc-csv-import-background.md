# kbc-csv-import-background.md — format facts & design decisions (BACKGROUND ONLY)

> Reference/context for the KBC monthly CSV import feature. This file is background only —
> it contains NO build instructions. The build steps live in the separate
> `kbc-csv-import-instructions.md`. Keep the two apart on purpose.
> Companion to PROJECT-CONTEXT.md, pdf-import-plan.md, DESIGN-SPEC.md.

---

## 1. Scope (narrowed by owner 2026-07-30)

- ONLY the KBC **"export" CSV** (the transaction overview you export from KBC Touch/Mobile).
  The generated monthly *report* (both PDF variants) is dropped from scope — the export CSV
  suffices and is far more robust.
- This is a SECOND import source next to the existing per-transaction PDF import. Same
  downstream pipeline (preview → suggest wallet → dedupe → confirm), a different parser and
  two new behaviours (recurring-link + monthly balance snapshots).
- KBC only. Reuses the existing bank/import infrastructure.

## 2. The real CSV format (verified against a real export, 2026-07-30)

- **Encoding UTF-8. Delimiter `;`. Line terminator `\r` (CR only). Header row present.
  18 columns.** A real file was parsed to confirm all of this — do not assume Latin-1 or
  comma; the earlier third-party docs were partly stale.
- Header (exact strings):
  `Rekeningnummer;Rubrieknaam;Naam;Munt;Afschriftnummer;Datum;Omschrijving;Valuta;Bedrag;
   Saldo;credit;debet;rekeningnummer tegenpartij;BIC tegenpartij;Naam tegenpartij;
   Adres tegenpartij;gestructureerde mededeling;Vrije mededeling`
- **Rows are newest-first** (e.g. 31/12 → 01/12). Never assume chronological order — sort by
  `Datum` for any date-ordered logic (esp. reconciliation).
- **Dates are `dd/mm/yyyy`** (slashes) in the CSV — note this differs from the PDF adapters'
  `dd-mm-yyyy`. Parse per-source; don't share a date regex.
- **Amounts:** `Bedrag` like `-50,62` / `2714,95` — comma decimal, minus prefix for debits.
- **Direction is explicit:** the `credit` and `debet` columns are reliably populated (one of
  them holds the amount). Prefer these over inferring from the `Bedrag` sign; fall back to
  sign only if both are blank.
- **Counterparty is two-path:**
  - Transfers (`OVERSCHRIJVING` / `INSTANTOVERSCHRIJVING`) populate `Naam tegenpartij` +
    `rekeningnummer tegenpartij` + `BIC tegenpartij` cleanly.
  - Card payments (`BETALING VIA BANCONTACT/DEBIT MASTERCARD`) leave those blank and bury the
    merchant inside `Omschrijving`, after a `TYPE  dd-mm  dd-mm-yyyy OM hh.mm UUR ` preamble
    and before ` MET KBC-DEBETKAART …`. So: use `Naam tegenpartij` when present, else extract
    the merchant from `Omschrijving`. The counterparty-key cleaning (strip town/legal-form/
    locality) is the SAME logic the PDF adapter already uses.
- **`Vrije mededeling`** = the human note (e.g. "spaargeld maandloon 1", "Avondeten",
  "STEAKS GELD"). Map to `note`. `gestructureerde mededeling` (+++…+++) is a payment
  reference → keep in `raw`, not the human note.
- **`Afschriftnummer`** (e.g. `02025266`) is **per-transaction/per-day-ish, NOT one number
  per whole statement** — the real file shows a range (…245 … 266) across the month. It is a
  useful per-row dedupe component but is NOT a document-level "statement id". (This corrects
  the earlier monthly-import-plan.md assumption; there is no single statement number to
  key whole-document dedupe on. Per-row fingerprints — as the PDF path already does — are the
  dedupe mechanism.)
- **`Saldo`** = running balance AFTER each row. Because rows are newest-first, the FIRST
  listed row's Saldo is the month-end balance and the LAST listed row's `Saldo` is the oldest
  in the file. See §4 for how this feeds the monthly-balance control.

The anonymized real file is the fixture: `test-fixtures/kbc-csv/monthly-export-01.csv`
(42 rows: card payments, transfers in/out, a self-transfer "spaargeld maandloon 1" that
stands in for a recurring salary, structured-communication examples). NEVER commit a real
statement — this fixture is already anonymized.

## 3. Recurring-link behaviour (owner decision a, 2026-07-30)

Recurring income/expenses (salary, rent) are already posted automatically by the app's
recurring rules, so importing them again would double-count. Owner's refined model — a
PERSISTENT LEARNED LINK, not a re-verify-every-month prompt:

- **First encounter:** when an imported row plausibly matches an existing recurring rule
  (match primarily on **amount**, plus direction, and sensibly the counterparty/timing), the
  row surfaces in the preview asking the user to CONFIRM the link ("Is this your recurring
  income *Salary*?"). It is not imported as a new transaction.
- **On confirm, the link is SAVED** (a persistent association between that recurring rule and
  the matched signal, e.g. counterparty key + amount). From then on, in future monthly
  uploads, a matching row is **recognised automatically and silently** as that recurring rule
  — no row surfaced, not imported, no prompt.
- **Deviation re-surfaces it:** if a future row that maps to a linked recurring rule has a
  **different `Bedrag`** than the saved link/rule amount, it RE-SURFACES for confirmation:
  "This looks like *Salary* but the amount changed (rule €2000 → statement €2050). Still the
  same recurring income? Update the recurring rule to the new amount?" The user can (i)
  confirm + update the rule amount, (ii) confirm as the recurring rule without updating, or
  (iii) reject the link (then it's a normal importable row).
- Net effect: verify once, then it's automatic, and it only asks again when reality drifts
  from the rule — which doubles as a signal that the recurring rule needs updating.
- Linked/recognised recurring rows are **excluded from the commit** (never double-counted)
  but still **count toward the balance reconciliation** in §4 (the money did move).

## 4. Monthly balance snapshots (owner decision b, 2026-07-30)

Owner wants the app to persist a **balance snapshot per month boundary** — the balance on the
1st of each month at 00:00, which is simultaneously the end of the previous month and the
start of the next. Purpose: a drift-detector. Normally unnecessary, but it catches the app
silently diverging from the real bank account (e.g. a transaction entered wrong in the app).

- **From the CSV:** the month's opening and closing balances are read from the `Saldo` column
  at the month's date-sorted endpoints (oldest row's saldo context = opening; newest row's
  saldo = closing). These are the ground-truth boundary balances for that account+month.
- **Stored in the app** as monthly snapshots (per user, per account, per month boundary), so
  the value persists and can be compared across months and against the app's own computed
  balance.
- **Two checks at import time (both soft — warn, never block; matches owner's "warn but
  proceed"):**
  1. *Internal consistency:* `opening Saldo + Σ(Bedrag over all rows, incl. recurring) ==
     closing Saldo`. If not, a row is likely mis-parsed.
  2. *Drift check:* the imported month's opening balance should match the previously stored
     snapshot for that boundary (and/or the app's own computed balance at that date). A
     mismatch flags that the app has drifted from the bank — the whole point of the feature.
- On mismatch: prominent, non-blocking warning explaining which check failed and the two
  numbers. User may proceed.

## 5. What is reused vs new

Reused unchanged: `suggestWallet`, `dedupe` (per-row fingerprint), the hybrid credit routing
(refund-credit vs log-as-income), the `import_transactions` RPC, `counterparty_wallet_mappings`,
`transactions.import_fingerprint`, `settings.bank_provider`, the Import page shell + preview
table.

New: the CSV adapter; the recurring-link matcher + its persistent link storage; the monthly
balance-snapshot storage + the two reconciliation checks; the import-source toggle in the UI.

## 6. Schema implications (for the assistant's channel — NOT applied by Claude Code)

Two new tables are expected (final shape to be written & verified by the chat assistant via
the db-migration STOP pattern; Claude Code only drafts/consumes them, never applies):

- **recurring_import_links** — persistent link between a recurring rule and an import signal.
  Roughly: user_id, a reference to the recurring rule (income vs expense — note the app has
  TWO rule tables, `income_recurring` and `recurring_rules`, so either a type discriminator +
  id, or two nullable FKs), counterparty_key, linked_amount, created_at, last_seen_at. RLS
  four-policy pattern.
- **monthly_balance_snapshots** — user_id, account_iban (or a hash), month boundary date
  (the 1st, 00:00), balance numeric, source ('kbc_csv'), created_at/updated_at, unique on
  (user_id, account, boundary). RLS four-policy pattern.

Exact DDL is intentionally NOT in this file — the chat assistant writes it against the live
schema after Claude Code's plan-mode proposal defines what it needs. If plan mode reveals no
persistent link table is needed (e.g. the existing mappings table can carry a recurring flag),
that's a fine simplification to propose.

---
*Corrections from the real file (2026-07-30): UTF-8 not Latin-1; dd/mm/yyyy dates; explicit
credit/debet columns; Afschriftnummer is per-row not per-statement; rows newest-first.*

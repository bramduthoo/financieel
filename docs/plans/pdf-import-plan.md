# pdf-import-plan.md — PDF bank-statement import (Phase 3)

> **Status: see `PROJECT-CONTEXT.md` §6.** Shipped as PR #17, 2026-07-26. Kept as the living spec that src/lib/import/ cites by section.

> Companion plan file for the PDF import phase. Read together with PROJECT-CONTEXT.md and
> DESIGN-SPEC.md. Strategy decided in the phase-3 design chat (2026-07-11). Maintain like
> PROJECT-CONTEXT: fold decisions back in as they land.

---

## 1. Goal

Upload a bank statement PDF (rekeninguittreksel, as downloaded from the bank's mobile app /
web banking), parse it in the browser, and turn its transactions into wallet debits/credits —
with amount, counterparty name, date, and note extracted automatically, a **suggested** wallet
per row, and a mandatory preview/edit/confirm step before anything is committed. Nothing is
ever auto-committed.

## 2a. CONFIRMED from a real sample (2026-07-26) — supersedes assumptions below

A real KBC PDF was analyzed (text layer extracted directly, not guessed from the render).
Finding: KBC's "Elektronisch afschrift" from the mobile app is a **per-transaction export**
("Export KBC Mobile" — literal string in the footer of every file), NOT the classic monthly
multi-transaction uittreksel. **One PDF = one transaction.** Full derived spec:
`kbc-adapter-spec.md` (companion file, keep alongside this one). Headline consequences:

- No beginsaldo/eindsaldo/volgnummer exists in this format → the reconciliation gate in §4/§10
  below does NOT apply to the KBC-mobile adapter. Keep the mechanism written generically in
  case a classic-uittreksel adapter is added later (a different input path), but KBC v1 has
  no analogous check.
- **Multi-file upload is a v1 requirement**, not a nice-to-have — users will batch-drop many
  single-transaction PDFs at once.
- Dedupe is per-transaction fingerprint only (§7); there is no statement-level ledger for this
  format specifically (the `imported_statements` table can stay generic for a future adapter
  that does have volgnummer).
- **Only the card-payment (Bancontact/KBC-Debetkaart) layout is confirmed.** Transfer,
  domiciliëring, and incoming-credit layouts are unconfirmed — see kbc-adapter-spec.md §4.
  **v1.0 scope proposal: card payments only**, expand once those fixtures exist.
- Fixture: `test-fixtures/kbc-mobile-export/card-payment-01.txt` (anonymized from the real
  sample).

## 2. Decisions LOCKED (from the design chat)

- **Parsing is deterministic and 100% client-side** (pdf.js text extraction). The PDF never
  leaves the browser; it is NOT uploaded to Supabase storage or any server. Only confirmed
  transactions hit the DB. Rationale: no server tier exists (Vercel static + Supabase), and the
  project's privacy stance (see encryption phase) makes shipping raw statements anywhere the
  wrong default. **Claude-API extraction is explicitly parked** — a possible opt-in fallback in
  the later AI-features phase, not part of this build.
- **Adapter pattern.** One canonical normalized-transaction model + one downstream pipeline
  (suggestions → dedupe → preview → commit). Per-bank parsers are thin adapters implementing
  `detect(text) → confidence` and `parse(text) → ParsedStatement`. Adding a bank = one adapter
  file + fixtures, nothing else changes.
- **Bank auto-detection is the router; the Settings choice is the default/tiebreaker.** The
  PDF identifies its bank (header text, IBAN, layout fingerprint). Settings gets a
  `bank_provider` preference listing the **supported** banks; it pre-selects and breaks ties,
  but a mismatching upload is detected and handled (confirm with user), not misparsed.
- **Target banks: KBC only for the first months.** Belfius/BNP Paribas Fortis/ING stay
  possible future adapters (the architecture supports them) but are explicitly NOT in scope
  until KBC is solid and another bank's fixtures exist. No adapter is written without at
  least one real (anonymized) statement — see §10 rollout gate.
- **Input format: PDF only** in this phase. The adapter interface stays format-agnostic
  (an adapter could emit the same normalized model from CSV later), but no CSV work now.
- **Both debits and credits are parsed and shown in the preview.** Credit handling =
  **hybrid per-row (option d)**, RESOLVED — see §3.
- **No cap logic on imported debits.** Capped-wallet behaviour applies to income
  distribution only; an imported debit is a plain spend. State this to Claude Code
  explicitly so it doesn't invent cap handling.
- **Wallet suggestions are two-layer** (learned mappings + cold-start heuristics), always
  presented as suggestions (pre-filled but visibly "suggested", user editable). See §6.
- **Commit path is a transactional RPC** (all-or-nothing, SECURITY INVOKER, no client-side
  balance math), written & live-verified by the chat assistant, applied via the db-migration
  skill + STOP pattern. See §8.
- **Statement reconciliation is a hard parser gate:** every Belgian uittreksel carries
  beginsaldo/eindsaldo; if `beginsaldo + Σ(parsed) ≠ eindsaldo` the import is refused with a
  clear error, never silently partial. This is the defence against layout drift.

## 3. RESOLVED — credit routing = (d) HYBRID (decided 2026-07-26)

Statements contain credits (the incoming-transfer sample confirms: `+100,00`, no minus).
In Financieel, income normally enters via the Income flow (`income_entries` + distribution),
not a bare wallet credit. **Decision: hybrid per-row.** Each incoming (credit) row in the
preview offers TWO actions:
- **"Refund credit → wallet"**: commit as a plain wallet credit into a user-chosen wallet.
  For refunds, peer paybacks, etc. (e.g. the "bbq" money coming back). Goes through the
  import RPC's credit path (increment wallet balance + insert a credit `transactions` row),
  NOT income_entries.
- **"Log as income →"**: hands off to the EXISTING income flow — creates an `income_entries`
  row and opens DistributionPopup (reuse the exact current component/flow; do NOT reimplement
  distribution). For salary and any real income that must distribute.

Default per row: a credit defaults to **"Refund credit"** with the wallet unselected (a
conscious choice required), because most imported credits in this app's real usage are peer
transfers/refunds, not salary; salary is rare and the user will deliberately pick "log as
income". Debits are unaffected — always a wallet debit.

Commit-path consequences (see §8):
- The `import_transactions` RPC handles debits + refund-credits (balance-adjusting inserts,
  all-or-nothing).
- "Log as income" rows are NOT committed by that RPC. They are handed one at a time to the
  existing income logging path (which already has its own atomic distribution write). Two
  separate commit mechanisms; keep them separate rather than fusing distribution into the
  import RPC.
- Reuse, don't duplicate: the "log as income" hand-off must call the SAME code the Income
  page uses today (DistributionPopup + whatever it calls on confirm), per the project's
  reuse-the-shared-primitive rule.

## 4. What Belgian statements give us (parser facts)

- Official PDF rekeninguittreksels are digitally generated (real text layer, no OCR needed),
  downloadable from the banks' apps/web banking.
- Statement metadata: account IBAN, **volgnummer** (sequential statement number per year),
  **beginsaldo / eindsaldo** (→ the reconciliation gate, and volgnummer → whole-document
  dedupe, §7).
- Transactions are **multi-line blocks** of variable length: amount+date line, counterparty
  name + IBAN, then the mededeling. Card payments ("Betaling met debetkaart") embed merchant
  name, location and timestamp → the note/metadata source. Transfers carry a **vrije
  mededeling** (human note → note field) or a **gestructureerde mededeling**
  (`+++123/4567/89012+++` → strip from the note, keep in raw).
- Two dates per line: boekingsdatum vs valutadatum — pick ONE consistently (boekingsdatum)
  and document it.
- Locale: amounts as `1.234,56` (comma decimal). **Date format is bank/format-specific —
  don't assume**: the classic uittreksel is commonly `dd/mm/yyyy`, but the confirmed KBC
  mobile-export sample uses `DD-MM-YYYY` with hyphens. Each adapter parses its own confirmed
  format; never share a hardcoded date regex across adapters. Dutch type keywords
  (Overschrijving, Domiciliëring, Doorlopende opdracht, Instantbetaling,
  "Betaling met KBC-Debetkaart") are classification signals (Domiciliëring ⇒ likely a fixed
  wallet).
- KBC statements exist in NL/FR/EN — the adapter should key on layout/labels robustly;
  v1 may declare NL-only and detect+refuse other languages explicitly.

## 5. Architecture & file layout

All parsing/enrichment logic = **pure functions in `src/lib/import/`**, unit-tested against
fixtures (matches the project's behaviour-test philosophy; survives the encryption migration).

```
src/lib/import/
  types.js            // NormalizedTransaction, ParsedStatement (JSDoc typedefs)
  extractText.js      // pdf.js wrapper: PDF File → positioned text items (the only impure edge)
  detectBank.js       // text → {bank, confidence}; uses settings.bank_provider as tiebreaker
  banks/
    <bank>.js         // one adapter per supported bank: detect() + parse()
  normalize.js        // shared helpers: parse €-amounts, dd/mm dates, strip structured refs
  suggestWallet.js    // two-layer suggestion engine (§6)
  dedupe.js           // fingerprinting + duplicate flagging (§7)
```

**NormalizedTransaction (canonical model):**
`{ date, amount (positive number), direction: 'debit'|'credit', counterparty (name),
counterpartyIban?, note (cleaned mededeling / merchant+location), typeKeyword?, raw (source
lines), fingerprint }`

**ParsedStatement:** `{ bank, accountIban, statementNumber (volgnummer), openingBalance,
closingBalance, transactions: NormalizedTransaction[] }` — reconciliation asserted here.

UI: an Import page/flow (entry point per DESIGN-SPEC; likely from Settings and/or the
Wallets/Transactions area — propose in plan mode): file picker → parsing → preview table
(editable rows: wallet dropdown pre-filled with suggestion + "suggested" marker, editable
note, include/skip toggle, duplicate rows default-skipped and flagged) → summary
("N transactions into M wallets, total € X") → confirm → RPC → result report. Both themes,
tokens per DESIGN-SPEC.

## 6. Wallet suggestion engine (two layers)

1. **Learned mappings (the strong layer).** Table `counterparty_wallet_mappings`
   (user_id, counterparty_key, wallet_id, last_confirmed_at, times_confirmed). On every
   confirmed import, upsert the mapping from each row's normalized counterparty key
   (lowercased, stripped of store numbers/locations — e.g. "COLRUYT 1234 GENT" →
   "colruyt") to the wallet the user chose. Next import: exact key hit ⇒ high-confidence
   suggestion. This is the engine that makes the feature feel automatic from the second
   import onward.
2. **Cold-start heuristics (the weak layer).** No mapping hit ⇒ fuzzy-match counterparty
   & note tokens against wallet names; type-keyword hints (Domiciliëring ⇒ prefer fixed
   wallets). Be honest in expectations: merchant names rarely resemble wallet names, so
   the FIRST import is mostly manual assignment. Unmatched rows default to **no wallet
   selected** (forcing a conscious choice), not to Unallocated.
   - Optional v1.1 (propose, don't build unasked): user-editable keywords per mapping so
     users can pre-seed rules.

Suggestions are NEVER certainty: pre-filled + marked, one tap to change.

## 7. Duplicate detection (two levels)

- **Row level:** `fingerprint = hash(user, accountIban?, date, amount, counterparty_key)`.
  Stored on committed transactions (new nullable `transactions.import_fingerprint` column —
  also usable later to distinguish imported from manual rows). Preview checks fingerprints
  against existing rows; hits are flagged and default to "skip" (overridable — two genuinely
  identical same-day purchases exist, hence override not block).
- **Document level:** table `imported_statements` (user_id, bank, account_iban_hash,
  statement_number, imported_at). Re-uploading an already-imported volgnummer ⇒ prominent
  warning before the preview.

## 8. Commit path (invariant-critical)

- New transactional RPC, working name `import_transactions(p_items jsonb)` — the
  `edit_income_distribution` mould: SECURITY INVOKER, `search_path=''`, everything scoped to
  `auth.uid()`, validates every wallet_id is owned by caller, inserts the transaction rows
  and adjusts balances **inside the function**, all-or-nothing; also records the
  `imported_statements` row. Exact shape depends on the §3 credit decision (option (c)/(d)
  adds an income path).
- Written & live-verified by the chat assistant (DO-block / test-session pattern from §4 of
  PROJECT-CONTEXT), applied via the owner's channel. **Claude Code never applies the
  migration and never does client-side balance math** — it only calls `supabase.rpc(...)`.
- db-verifier invariants run on an imported batch after the owner's UI test.

## 9. Schema changes — **DONE, applied & verified 2026-07-26**

All five landed in two migration files, applied by the owner and re-verified read-only against
the live DB (columns, tables, RLS flags, all 8 policies, both indexes, function present as
SECURITY INVOKER):

1. ✅ `settings.bank_provider text` (nullable; CHECK restricting to supported banks — `'kbc'` today).
2. ✅ `counterparty_wallet_mappings` (+ standard user_id/RLS four-policy pattern, + UNIQUE
   `(user_id, counterparty_key)` — the upsert target the RPC needs).
3. ✅ `transactions.import_fingerprint text` nullable (+ partial index where not null).
4. ✅ `imported_statements` (+ RLS pattern). **Written by nothing in v1** — the KBC mobile
   format has no volgnummer, so this is scaffolding for a future classic-uittreksel adapter.
5. ✅ `import_transactions(p_items jsonb)` RPC — SECURITY INVOKER, `search_path=''`,
   all-or-nothing, balance math inside the function, upserts the learned mappings.

Files: `supabase/migrations/20260726120000_import_schema.sql` and
`..._20260726120100_import_transactions_rpc.sql`.

> **Correction (2026-07-26):** this section previously read *"No repo SQL files exist — live DB
> is truth"*. That is no longer accurate. The repo now has a **`supabase/migrations/` folder**
> (first files added 2026-07-09), and every schema change since is committed there as a
> timestamped `.sql` file with a purpose/date/impact/rollback header. The live DB remains the
> ground truth for what is *actually applied* — the folder is not auto-applied and no migration
> runner executes it — so the verify-after-apply step in the db-migration skill still stands.

## 10. Build order & bank rollout

**Pre-build (before the Claude Code session):**
- **P0 — fixtures: DONE.** Four anonymized KBC fixtures exist
  (`test-fixtures/kbc-mobile-export/`: card physical, card virtual, transfer in, transfer
  out). Owner adds them to the repo. Domiciliëring fixture optional/later.
- **P1 — §3 credit routing: DONE** = hybrid (d), see §3.
- **P2 — Claude Code RESEARCH subagent** (separate session, keep noise out of the build):
  pdf.js text extraction specifics (positioned text items → line reconstruction, Vite
  bundling + worker setup, bundle-size impact). Bank-layout intel is already captured in
  kbc-adapter-spec.md, so this subagent is now ONLY about the pdf.js/Vite plumbing. Output:
  short notes file. (This is the one remaining pre-build step.)

**Build session order (plan mode first):**
1. `extractText` + first bank adapter + `normalize`, unit tests vs fixtures, reconciliation
   gate. (Pure lib; NEVER commit real statements — anonymized fixtures only.)
2. `suggestWallet` + `dedupe` (pure, tested) — mappings table read path.
3. Schema migrations (assistant channel, STOP) + `import_transactions` RPC (assistant
   writes/verifies).
4. Preview/confirm UI per DESIGN-SPEC; Settings bank selector (supported banks only).
5. Gates: full test suite, design-check, code-reviewer, Playwright screenshots (import flow,
   both themes; note Playwright can't do the real bank PDF e2e — owner runs one real import,
   assistant db-verifies), wrapup.

**KBC transaction-type rollout (v1 is KBC-only; sub-scope by transaction type — see
kbc-adapter-spec.md):**
- [x] Card payment, physical (Bancontact/KBC-Debetkaart) — confirmed 2026-07-26
- [x] Card payment, virtual (Debit Mastercard / M4M) — confirmed 2026-07-26
- [x] Transfer out (Instantoverschrijving, debit) — confirmed 2026-07-26
- [x] Transfer in (Instantoverschrijving, credit, no minus sign) — confirmed 2026-07-26
- [ ] Direct debit (Domiciliëring) — needs a real anonymized sample; NOT a v1 blocker
v1 covers the two dominant families (card + transfer). Domiciliëring is deferred, parsed
generically until a fixture exists.

**Other banks (Belfius, BNP Paribas Fortis, ING):** parked, not in scope for the first
months. When picked up later: fixtures → adapter + tests → add to detector + Settings enum,
as a small dedicated session each.

## 11. Testing

- Behaviour tests per adapter against fixtures: exact amount/date/counterparty/direction per
  type (card physical, card virtual, transfer in with NO minus, transfer out), note
  extraction (card merchant+channel; transfer Mededeling), counterparty-key cleaning
  (town/legal-form/`*`-tag/foreign-locality stripping per adapter spec), and type dispatch
  (card vs transfer by detail-block label). Suggestion engine: mapping hit, cold-start fuzzy
  hit, no-match ⇒ null. Dedupe: fingerprint stability + collision behaviour.
  - NOTE: the reconciliation (beginsaldo+Σ=eindsaldo) test does NOT apply to KBC mobile
    export — that format has no balances. It's only for a future classic-uittreksel adapter.
- Supabase mocked at the boundary as usual; assert per-wallet euro totals for the commit,
  never call order.
- Any date-relative logic takes an injectable `now` (project rule since the testing phase).

## 12. Fixture anonymization procedure (owner)

Real statements are sensitive; fixtures must be committed, so: extract the text (the build's
own `extractText`, or copy-paste from the PDF), replace IBANs with valid-format fakes
(`BE68 5390 0754 7034`-style), replace real names with fakes, perturb amounts *consistently*
(keep beginsaldo + Σ = eindsaldo TRUE — the reconciliation tests depend on it), keep layout,
line breaks, keywords, and structured-communication formats byte-faithful. Store as `.txt`
extracted-text fixtures (plus optionally one sanitized PDF rebuilt only if needed for
`extractText` itself). **Never commit a real statement, even "mostly" anonymized.**

## 13. Claude Code kickoff prompt (use after the P2 pdf.js research subagent runs)

"Feature: KBC PDF transaction import. Branch b/pdf-import. Plan mode first — present your
plan and WAIT for approval before writing code.

Read first: pdf-import-plan.md, kbc-adapter-spec.md, DESIGN-SPEC.md, the pdf.js research
notes, and the real source files you'll touch (Income.jsx + DistributionPopup.jsx for the
'log as income' hand-off, src/lib/format.js, the router/nav, Settings). Verify the live
schema via the read-only MCP before assuming any column. Do NOT trust ARCHITECTURE.md or
Cursus/ for schema.

Scope (KBC 'Export KBC Mobile' per-transaction PDFs only): one PDF = one transaction;
multi-file batch upload is REQUIRED. Confirmed transaction types: card payment (physical +
virtual) and transfer (in/out). Direct debit (Domiciliëring) parsed generically only — no
fixture yet, don't invent its sub-layout. NO reconciliation/beginsaldo gate (this format has
no balances). No cap logic on imported debits.

Build order (per plan §5/§10):
(1) Pure lib in src/lib/import/: extractText (pdf.js — the only impure edge), detectBank
    (match 'Export KBC Mobile'), banks/kbc.js (branch on detail-block labels per adapter
    spec §4a: card vs transfer), normalize, all with unit tests against
    test-fixtures/kbc-mobile-export/ (NEVER commit real statements — anonymized fixtures
    only). Direction is from the amount sign (credit = no minus). Note field = Mededeling
    (transfers) or merchant+channel (cards).
(2) suggestWallet (two-layer: learned counterparty_wallet_mappings first, then cold-start
    fuzzy/keyword) + dedupe (per-transaction fingerprint) — pure, tested. Suggestions are
    pre-filled but flagged; unmatched → no wallet selected (not Unallocated).
(3) Schema migrations via the db-migration skill + STOP for owner apply (assistant writes &
    verifies; you NEVER apply writes): settings.bank_provider, counterparty_wallet_mappings,
    transactions.import_fingerprint, imported_statements, and the import_transactions RPC.
(4) Import page/flow per DESIGN-SPEC (multi-file picker → parse → editable preview table →
    confirm), both themes. Rows: auto-fill date/amount/direction/note; suggested wallet
    (editable, marked); include/skip; duplicate rows default-skipped+flagged. CREDIT rows =
    hybrid (§3): per-row 'refund credit → wallet' vs 'log as income →'; the latter reuses
    the EXISTING Income/DistributionPopup flow (do not reimplement distribution). Settings
    bank selector listing supported banks (KBC only for now).
(5) Commit: debits + refund-credits ONLY via import_transactions RPC (supabase.rpc) — no
    client-side balance math. 'Log as income' rows go through the existing income path.

Gates: full test suite, design-check (incl. the indigo/purple grep), code-reviewer,
Playwright screenshots of the import flow both themes (note: Playwright can't do the real
KBC-PDF end-to-end — owner runs one real import, assistant db-verifies invariants on the
batch), db-verifier, wrapup. Report exactly what changed; don't paste full dumps."

---
*Update §3 with the credit decision and §10's rollout checklist as banks land.*

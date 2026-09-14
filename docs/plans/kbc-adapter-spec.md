# KBC adapter spec — "Export KBC Mobile" per-transaction PDF

> **Status: see `PROJECT-CONTEXT.md` §6.** Shipped as part of PR #17. Kept as the living spec that src/lib/import/banks/kbc.js cites.

> Derived from a real anonymized statement (2026-07-26). Card-payment layout CONFIRMED.
> Transfer / domiciliëring / incoming-credit layouts NOT YET SEEN — flagged below.
> Fixtures: test-fixtures/kbc-mobile-export/. Do not invent unseen layouts; request a
> real sample instead.

## 0. Format identity (this is NOT a monthly uittreksel)

This is KBC Mobile's **per-transaction export** ("Elektronisch afschrift" / footer says
literally "Export KBC Mobile"). **One PDF = one transaction.** No beginsaldo/eindsaldo, no
volgnummer, no transaction list. Consequences for the pipeline:

- The statement-level reconciliation gate (§ in pdf-import-plan.md) does NOT apply to this
  adapter — there is nothing to reconcile against. Keep that mechanism for a possible future
  classic-uittreksel adapter, but this adapter has no analogous check.
- **Multi-file upload is required, not optional.** A user will drop in a batch of these after
  a shopping trip. The import UI's file input must accept multiple files and the pipeline
  must produce one preview table merging all of them.
- Dedupe must work purely at the per-transaction fingerprint level (date+amount+counterparty),
  since there is no statement ledger to check "already imported this document" against.
- `detectBank()` should key on the fixed header lines + the footer's literal string
  `Export KBC Mobile` (robust, appears in every file of this format).

## 1. Fixed header block (every file, 4 lines, always at the same relative position)

```
<ACCOUNT HOLDER NAME>       e.g. "DUTHOO BRAM"
KBC-Rekening
<IBAN split across tokens>  e.g. "BE50 7360 4140 4718 EUR"  (4-char groups + currency)
Elektronisch afschrift
```

Parse: holder name = line 1 (verbatim). IBAN = concatenate the BEnn + 4-digit groups on
line 3, drop the trailing currency token separately (currency = last token, always "EUR"
in samples). This IBAN is the OWN account, not the counterparty.

## 2. Transaction line (one per file)

```
<DD-MM-YYYY>   <Counterparty name + town>                    <±amount,decimals> <CCY>
```

Real example: `24-07-2026   Kinepolis Multi N.V. BE8500 KORTRIJK    -31,40 EUR`

- Date: `DD-MM-YYYY`, hyphens (NOT slashes — differs from the classic uittreksel format
  assumed earlier in the plan). Parse with an explicit format string, don't assume.
- Amount: sign is literal (`-` prefix seen for a debit; expect no sign or `+` for a credit —
  UNCONFIRMED, no credit sample yet). Decimal comma, no thousands separator in samples (all
  amounts under 1000 so far — do not assume thousands separator behaviour untested).
  Currency token trails, separated (superscript in the rendered PDF; a plain word in the
  text layer, confirmed by extraction: `EUR` as its own word).
- Counterparty field: free text, in this sample `"Kinepolis Multi N.V. BE8500 KORTRIJK"` —
  i.e. **legal name + Belgian postal code + town, no separator**. For the counterparty-key
  used in wallet-mapping (§6 of pdf-import-plan.md), strip trailing `BE\d{4}\s+[A-Z]+` town
  suffix and legal-form tokens (`N.V.`, `NV`, `BVBA`, `BV`) before lowercasing — otherwise
  "Kinepolis Multi N.V. BE8500 KORTRIJK" and a future "Kinepolis Gent BE9000 GENT" won't
  collapse to the same learned mapping key.

## 3. Detail block (indented sub-lines under the transaction line)

Confirmed shape for a **card payment (Bancontact / KBC-Debetkaart)**:

```
via Bancontact                (payment channel; may vary — "via Maestro"? unconfirmed)
Datum
<DD-MM-YYYY> om <HH.MM> uur
Debetkaart
<4-digit> <2-digit>XX XXXX <4-digit>     (masked card number, KBC pre-masks it)
Kaarthouder
<cardholder name>
Betaling met KBC-Debetkaart              (transaction-type description — the closest
                                           thing to a "note"/type keyword this format has)
```

Each label (`Datum`, `Debetkaart`, `Kaarthouder`) is its own line, value on the next line —
a label/value pair pattern, not one line per field. Parse as alternating label/value once
the transaction line is consumed, rather than fixed line offsets (robust to a detail block
gaining/losing a line for a different payment channel).

**Note field mapping:** there is no separate free-text note field for a card payment — the
"note" IS the counterparty name + the trailing type description
(`Betaling met KBC-Debetkaart`). Suggest composing the normalized `note` as the
counterparty name (already captured separately) with the payment channel (`via Bancontact`)
as supplementary context, and using `Betaling met KBC-Debetkaart` as the `typeKeyword`.

## 3b. Detail block — TRANSFER (Instantoverschrijving) — CONFIRMED

Confirmed from two real samples (one incoming +100,00, one outgoing -13,00). Shape:

```
Rekeningnummer
<counterparty IBAN, spaced groups>       e.g. "BE73 4460 2446 5160"
BIC: <bic>                               e.g. "BIC: KREDBEBBXXX"
Mededeling
<free-text human note>                   e.g. "Windmolen" / "bbq - bram"   <-- THE note field
Tijdstip
<HH.MM> uur
[Met                                     <-- OPTIONAL block, present on the outgoing sample
 <channel>]                                  value e.g. "KBC Mobile"
Instantoverschrijving                    <-- transaction-type keyword (typeKeyword)
```

- **Direction from sign only.** Incoming credit prints the amount with **no minus**
  (`100,00 EUR`); debit prints `-13,00 EUR`. There is NO separate direction word — sign is
  authoritative. (Confirms §2: parse the literal sign.)
- **`Mededeling` is the gold note field** for transfers — map straight to normalized `note`.
  Watch for structured communications here too (`+++nnn/nnnn/nnnnn+++`): if the Mededeling
  matches that pattern, keep it in `raw` but consider stripping/flagging it in `note` (it's
  a payment reference, not a human note). No structured-comm sample yet — handle defensively,
  don't assume format beyond the standard `+++dd d/dddd/ddddd+++`.
- **`Met` block is optional** — present on the KBC-Mobile-initiated outgoing transfer, absent
  on the incoming one. Reinforces: parse the detail block as alternating label/value pairs
  keyed by the known italic labels (`Rekeningnummer`, `Mededeling`, `Tijdstip`, `Met`), NOT
  by fixed line offsets. The counterparty **name** is the transaction line's middle field
  (e.g. "COROMINAS GARCIA EDIT", "joran") — for transfers it is a person/company name with
  no town/postal-code suffix, unlike card payments.
- **counterparty-key for wallet mapping:** transfers to individuals ("joran", "pieter") are
  poor mapping keys (peer transfers rarely recur to the same wallet). Still store the key,
  but expect the cold-start heuristic to whiff on peer transfers — that's fine, the user
  assigns and (with a person they pay regularly) the learned mapping kicks in next time.

## 3c. Detail block — VIRTUAL card / Mastercard — CONFIRMED

Confirmed from a real sample (ANTHROPIC* CLAUDE SUB, -22,39). Same as the physical-card
block (§3) but:
- Channel line reads `via Debit Mastercard` (vs `via Bancontact`).
- An EXTRA label/value pair appears between Debetkaart and Kaarthouder:
  ```
  Virtueel kaartnummer contactloze betaling
  <masked virtual card number>
  ```
- Type line reads `Betaling met M4M - MDES for merchants` (vs `Betaling met KBC-Debetkaart`).
- Counterparty is a merchant string, often with `*` and a foreign locality
  (`ANTHROPIC* CLAUDE SUB US94104 SAN FRANCISCO`). counterparty-key cleaning must also strip
  a trailing `US\d+ <CITY>` / non-BE locality suffix and the `*`-suffixed program tag, so
  "ANTHROPIC* CLAUDE SUB US94104 SAN FRANCISCO" collapses to a stable "anthropic" key.
- **This confirms the detail block gains/loses lines by payment type** → the label/value-pair
  parser (not fixed offsets) is mandatory, not just advisable.

## 4. STILL unconfirmed — one branch only

- **Direct debit (`Domiciliëring`)**: likely names the originator/creditor company + a SEPA
  mandate reference; not yet seen. Build defensively or defer this type. NOT a v1 blocker —
  card payments + transfers (the confirmed majority) are enough for a useful v1.
- **Footer** is stable across all four samples: last line always
  `<timestamp>-A031-<IBAN, no spaces> Export KBC Mobile <page>/<page count>`.
  `detectBank()` matches on `Export KBC Mobile`; nothing else from the footer is needed.

## 4a. Transaction-type dispatch (how the adapter branches)

After parsing the fixed header + transaction line, branch on which labels the detail block
contains (NOT on line count):
- contains `Debetkaart` / `Kaarthouder` → **card payment** (§3). `Virtueel kaartnummer`
  present → virtual-card variant (§3c); both parse identically for the fields we keep.
- contains `Rekeningnummer` + `Mededeling` → **transfer** (§3b).
- contains a `Domiciliëring` marker → **direct debit** (unconfirmed; §4) — until a fixture
  exists, parse the common fields (date/amount/counterparty/note) generically and tag
  `typeKeyword` without relying on an unseen sub-layout.
Every type shares §1 (header) and §2 (transaction line) parsing; only the detail block differs.

## 5. Footer (ignorable for parsing, useful only for bank/format detection)

```
KBC Bank NV - Havenlaan 2 - 1080 Brussel - België
BTW BE 0462.920.226 - RPR Brussel
Een onderneming van de KBC-groep
<timestamp>-A031-<iban-no-spaces> Export KBC Mobile <n>/<n>
```

## 5b. Fixtures available (test-fixtures/kbc-mobile-export/)

- `card-payment-01.txt` — physical Bancontact debit card (§3)
- `card-payment-virtual-01.txt` — virtual Debit Mastercard (§3c)
- `transfer-in-01.txt` — incoming Instantoverschrijving, no minus sign (§3b)
- `transfer-out-01.txt` — outgoing Instantoverschrijving with `Met` block (§3b)

All four anonymized from real samples (2026-07-26). Enough to build & test a genuinely
useful v1 covering the two dominant types. Only `Domiciliëring` remains for a later fixture.

---
**v1 scope is now card payments + transfers (both confirmed).** Direct debit is the only
deferred type and is not a blocker. Add a Domiciliëring fixture later to close it.

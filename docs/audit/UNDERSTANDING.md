# UNDERSTANDING.md — the reasoned map

> Session 1 of the audit operation, 2026-09-04, Claude Opus 5. Read-only.
> Companion to `INVENTORY.md` (facts) and `DISCREPANCIES.md` (doc-vs-reality).
> Everything here is derived from reading the code on `origin/main` @ `aaeb44e`, not from the
> project's own documentation. Where I am inferring rather than verifying, the sentence says
> **INFERRED**.

---

## 1. What the app is, as the code shows it

Financieel is a **single-household envelope-budgeting app**. Not a ledger, not an expense tracker
with categories bolted on — the wallet *is* the primitive, and everything else exists to move money
between wallets or to tell you whether the wallets are funded.

The evidence for that reading, rather than the docs':

- `wallets` is the only entity every page touches. There is no `categories` table, no `accounts`
  table, no budget-period table. A "budget" is a column on a wallet (`wallets.budget`), not a
  separate object with a date range.
- Nothing in the schema models *net worth* or *external accounts*. The one place a real bank
  account appears is `monthly_balance_snapshots.account_iban`, and it exists purely to warn that
  the app's numbers have drifted from the bank's — a reconciliation aid, not a synced account.
- The domain vocabulary is Belgian and personal: `kbc-adapter-spec.md`, Dutch column names
  (`Bedrag`, `Saldo`, `Afschriftnummer`, `Datum`, `Valuta`), euro-only formatting hand-rolled in
  `format.js`, `domiciliëring` as a transaction type.
- Multi-user exists as an isolation mechanism, not as a collaboration feature. Every table carries
  `user_id` with four `{table}_{cmd}_own` RLS policies; there is no sharing, no household, no
  invite. Two people using this app have two disjoint datasets.

So: **one person's money, in envelopes, in euros, in Belgium.** The multi-user work makes it
deployable rather than social.

There is a second, quieter audience visible in the repo: the project is also a **teaching artefact**.
`Cursus/` is a 12-chapter, 400 KB course PDF about this codebase, and the density of explanatory
header comments in `src/lib/` is far above what a private app needs. Several files open by
explaining *why the obvious approach was rejected* (`csv.js` on not adding papaparse, `normalize.js`
on why `parseKbcDate` is named for its format, `extractText.js` on why the `?url` import cannot
move). That is written for a reader, not a maintainer.

---

## 2. The money lifecycle — every path a euro can take

This is the highest-risk surface, so it gets the most space. I traced every write.

### 2.1 The one hard rule and how it is actually enforced

`CLAUDE.md` rule 1 says balances are never computed or written client-side. **The code honours
this completely.** I checked every `wallets` write (`INVENTORY.md` §7.1): all four are config
updates carrying a `WalletModal` payload that has no `balance` key. Balance is *read* client-side
in two places and both times it is only fed straight back into an RPC.

But the enforcement is a *convention*, not a mechanism. `Wallets.jsx:43`, `WalletDetail.jsx:280`
and `Budgeting.jsx:139` all do `.update(values)` with an object spread from a modal. Nothing —
not a type, not a whitelist, not a DB trigger, not a lint rule — would stop `balance` from riding
along if it ever entered that payload. The rule is held up by the `code-reviewer` agent and the
owner's discipline.

### 2.2 Where money enters: income

There are three sources of income, and they differ in one consequential way.

**(a) Manual income** — `Income.jsx:262`. Insert an `income_entries` row (`source_type: 'manual'`),
then open `DistributionPopup`, then `distributeIncome(..., isAutomated: false)`.

**(b) Template income** — `Income.jsx:427`. Same, but `source_type: 'template'` and the popup is
pre-filled from `income_template_distribution_items` plus the template's `send_remainder` flag.

**(c) Recurring income** — `IncomeRecurringDetail.jsx:159`. Insert `source_type: 'recurring'` with
`income_recurring_id`, then distribute using the **saved** `income_distribution_rules` rows —
no popup — with **`isAutomated: true`**.

**(d) Imported income** — `Import.jsx:566`. A credit row the user chooses to "log as income"
inserts an `income_entries` row with `source_type: 'manual'` and hands off to the same popup +
`distributeIncome(..., isAutomated: false)` path. Imported credits are deliberately *not* pushed
through `import_transactions`.

The consequential difference: **`isAutomated: true` appears in exactly one place in the entire
codebase** — `IncomeRecurringDetail.jsx:174`. Since `isAutomated` is the only switch that turns on
the capped-wallet mechanic (`distributeIncome.js:30`), the whole capped subsystem is reachable
**only** by pressing "Log income" on a recurring income's detail page. Nothing else in the app can
trigger a cap fill, a reduction, or an overflow.

### 2.3 The distribution engine — three layers, cleanly separated

The separation here is the best-designed part of the codebase.

1. **`resolveDistribution.js` (pure, 55 lines, 18 tests)** turns `{mode, value}` rows into euros.
   The invariant that everything else depends on: **percentages are of the total, never of the
   running remainder** (`resolveRowExact`, line 14). It also materialises the "send remainder to
   Unallocated" sweep as just another row, so downstream code never has to know the sweep is
   special. Its `resolveRowExact` primitive is deliberately left *unrounded* so each caller applies
   its own rounding — that is why `unallocatedPlans.firePlan` can reuse it without inheriting the
   popup's rounding.

2. **`resolveCappedInflow.js` (pure, 28 lines, 3 tests)** is the capped-wallet arithmetic:
   `room = max(0, cap_max − balance)`, fill to the ceiling at 100%, reduce the excess to
   `cap_reduction_rate`, and derive `overflow` from the *rounded* `received` so the two sum to the
   input exactly. The conservation property is the point — it means a capped wallet cannot lose or
   create a cent.

3. **`distributeIncome.js` (64 lines, impure)** is the executor, and its own comment insists it is
   "dumb". It is: it never computes a split. It loops rows, calls `increment_wallet_balance` per
   row, accumulates `transactions` rows, and batch-inserts them at the end. Only the `isAutomated`
   + `budget_type === 'capped'` branch consults `resolveCappedInflow` and credits the overflow
   target (`overflow_wallet_id`, else Unallocated).

**A real weakness in step 3:** the RPC calls are sequential and *individually* non-transactional.
`distributeIncome.js` fires N `increment_wallet_balance` calls in a loop and inserts the transaction
rows once at the end. If call 3 of 5 fails, wallets 1–2 are already credited and **no transaction
rows exist at all** — the balances have moved with nothing recording it. Contrast this with
`import_transactions`, `edit_income_distribution` and `distribute_from_unallocated`, which are all
described as all-or-nothing. The oldest money path is the least protected one.

### 2.4 Where money leaves a wallet

- **Recurring expenses** — `TransactionChecklist.jsx:58`+`:72`: tick off a due rule → insert a
  `debit` transaction, then `decrement_wallet_balance`.
- **Variable spends** — `VariableTransactionForm.jsx:47-60`: add → `decrement`; edit → `increment`
  the old amount then `decrement` the new. `VariableTransactionList.jsx:35-39` and
  `VariableHistory.jsx:89-90` do the same reverse-then-reapply pair on edit/delete.
- **Fixed-wallet payment edits** — `PaymentHistory.jsx:108-109`, same pair.
- **Unallocated outbound** — `WalletDetail.jsx:715` → `distribute_from_unallocated`, atomic inside
  the RPC; the client writes neither balances nor transaction rows.

The reverse-then-reapply pairs are the second structural weakness. Every one is two sequential,
independent RPC calls with **no error handling between them** (`VariableTransactionForm.jsx:47-48`
is the clearest: `await increment(...)` then `await decrement(...)`, neither result inspected). If
the second fails, the wallet keeps the credit from the first. This pattern appears in five
components.

### 2.5 The Unallocated wallet — the system's overflow drain

`Unallocated` is a real `wallets` row with `type = 'unallocated'` and `is_system = true`, created
per user by the `handle_new_user()` signup trigger. It cannot be deleted
(`Wallets.jsx:handleDelete` returns early on `is_system`). Three things flow into it: an explicit
distribution row, the "send remainder" sweep, and capped-wallet overflow with no
`overflow_wallet_id`.

Flowing *out* of it happens two ways:

- **Manually**, via `DistributionPopup` in `outbound` mode from `WalletDetail`, optionally
  pre-filled from an `unallocated_templates` row.
- **Automatically**, via `unallocated_plans` — threshold-triggered rules with three modes
  (`amount_over_threshold`, `fixed_amount`, `full_balance`).

The automatic path is the most interesting piece of design in the app, and its behaviour under
ambiguity is deliberate. `evaluateUnallocatedPlans` (`unallocatedPlans.js:72`) is a
**check-on-change** evaluation, called after any action that might have raised the Unallocated
balance. It counts eligible plans and then:

- **1 eligible** → fire it.
- **>1 eligible** → **fire nothing.** Insert an `unallocated_pending_conflicts` row with a balance
  snapshot and the eligible plan ids, and stall until the user resolves it via
  `UnallocatedConflictBanner`. While a conflict is pending, nothing auto-fires ever, and if the
  set is still ambiguous the snapshot is refreshed.
- **0 eligible** → nothing.

Refusing to guess when two plans both apply, and *persisting* the refusal so it survives a reload,
is the right call for money and is rare in this kind of code. `firePlan` carries a second guard in
the same spirit (`unallocatedPlans.js:44`): if a plan's items do not fully allocate the computed
amount, it logs and skips rather than partially distributing.

**Where the check-on-change net has a hole.** `evaluateUnallocatedPlans` is called from six sites
(`INVENTORY.md` §7.2 lists them): three income paths, the import income path, the income-edit
path, and unallocated outbound. It is **not** called after `Import.jsx:398`'s
`import_transactions` commit. An imported credit assigned to the Unallocated wallet therefore
raises the balance past a threshold without any plan evaluating. **INFERRED** — I did not exercise
this; I am reading call sites. The next unrelated income would pick it up, so the effect is a
delay, not a loss.

### 2.6 Complete list of code paths that can move money

| # | Path | Mechanism | Atomic? |
|---|---|---|---|
| 1 | Manual/template/imported income distribution | `distributeIncome` → N× `increment_wallet_balance` | **No** — per-row RPCs |
| 2 | Recurring income distribution (+ cap mechanic) | same, `isAutomated: true` | **No** |
| 3 | Edit a logged income's distribution | `edit_income_distribution` | Yes (per its migration header) |
| 4 | Unallocated outbound, manual | `distribute_from_unallocated` | Yes |
| 5 | Unallocated outbound, auto-plan | `firePlan` → same RPC | Yes |
| 6 | Tick off a recurring expense | insert + `decrement_wallet_balance` | **No** — two calls |
| 7 | Add/edit/delete a variable spend | `increment`/`decrement` pairs | **No** |
| 8 | Edit a fixed-wallet payment amount | `increment` + `decrement` | **No** |
| 9 | Import a batch of bank transactions | `import_transactions` | Yes |
| 10 | Clear activity / full reset | `reset_user_data` | Yes |

Six of ten paths are non-atomic client-orchestrated sequences. All six are the *older* ones; every
path added since 2026-07-09 is a transactional RPC. The direction of travel is clearly right; the
back-catalogue was never revisited.

---

## 3. Subsystems and how they interlock

### 3.1 Distribution (the spine)

Everything routes through `DistributionPopup` (465 lines), which is mounted by four different
pages in four different modes: income (Income), pre-filled recurring (IncomeRecurringDetail),
outbound (WalletDetail, with `outbound` + `maxAmount`), and import income-handoff (Import). Its
props list — 15 parameters — is the honest measure of how much variation one component absorbs.

`strictMode` (from `settings.strict_distribution`) governs whether a distribution must exactly
exhaust the amount, and per the schema notes applies to manual/template distribution only.

### 3.2 Capped wallets

A wallet with `budget_type = 'capped'` carries `cap_max`, `cap_reduction_rate` and
`overflow_wallet_id`. The mechanic is deliberately asymmetric — manual and template income ignore
caps entirely, only automated (recurring) income enforces them — and `CLAUDE.md` rule 7 explicitly
forbids "simplifying" it.

`wallets.cap_reduction_enabled` is documented as a **dead column**, and the code confirms it:
`resolveCappedInflow` never receives it and `distributeIncome.js:30` branches only on
`budget_type === 'capped'`. Capped wallets always apply the mechanic.

`WalletModal.jsx:74` enforces `cap_max >= budget` in the UI, and
`20260717134100_wallets_cap_max_gte_budget.sql` backs it with a CHECK. That is the pattern I would
want to see everywhere and only see here.

### 3.3 Budgeting

The Budgeting page answers "across all my recurring incomes, is each wallet's monthly budget
covered?". `income_recurring.include_in_budget` selects which incomes participate.
`budgetPlan.js` (pure, 20 tests) is the model: `computeWalletFunding` aggregates allocations
across incomes, `autoFillSingle` fills must-fund wallets to budget in priority order with the
remainder to Unallocated, `buildRuleRows` turns an allocation back into ordered
`income_distribution_rules` rows.

`budgetFlowLayout.js` (pure, 237 lines, 15 tests) computes the flow diagram's geometry — node
rects, ribbon paths, de-collided labels — and `BudgetFlowChart.jsx` renders exactly what it
returns. Keeping SVG geometry in a tested pure function rather than in JSX is a genuinely good
call, and design-check now mandates it.

Note that Budgeting writes `income_distribution_rules` with a **delete-all-then-reinsert** per
income (`Budgeting.jsx:84-98`). The comment says as much and throws on either error, but there is
no transaction: a failed insert after a successful delete leaves an income with no distribution,
and a recurring income with no distribution cannot be logged.

### 3.4 Imports — two sources, one pipeline

This is the newest and, by test count, the best-covered subsystem: 15 modules, ~200 of the 352
tests.

- **PDF** (`banks/kbc.js`): the "Export KBC Mobile" per-transaction PDF. One file = one
  transaction. No `volgnummer`, no begin/end saldo, therefore **no reconciliation gate** — the
  adapter's header says so explicitly and warns not to invent one.
- **CSV** (`banks/kbcCsv.js`): the monthly export. One file = one month with a running `Saldo`,
  which is what makes reconciliation possible at all. Two behaviours exist only on this path:
  recurring-link matching and month-boundary snapshots.

Only `extractText.js` is impure. Everything else — tokenizing, parsing, normalizing, deduping,
suggesting, matching, reconciling, snapshotting, row-building — is a pure function with tests.
That architecture is why 28 tests can cover CSV batch assembly without a browser.

Three design decisions worth carrying forward:

- **`banks/kbcCsv.js` is not in the `detectBank` registry.** `ADAPTERS = [kbc]` — the PDF adapter
  only. `buildCsvRows.js` calls the CSV adapter directly because the source is an explicit user
  toggle, and putting a CSV into a PDF registry risks misparsing.
- **Both reconciliation checks are soft.** `reconcile.js` warns, never blocks, never drops a row.
  The reasoning in its header is that a statement tripping a check is still the best record of
  what happened.
- **Dedupe flags, never blocks.** `import_fingerprint` is a plain composite key, deliberately not
  a hash and deliberately not UNIQUE, because two identical same-day purchases are real.

The recurring-link mechanism deserves its own note because it is subtle and correct: recurring
income and expenses are already posted through their own flows, so importing the same movements
from a statement would double-count. `matchRecurring.js` detects them, excludes them from the
commit, and asks once; `recurring_import_links` remembers the answer so month two is silent.

### 3.5 Recurring rules — two parallel systems

`income_recurring` (income) and `recurring_rules` (expenses) are **separate tables with
near-identical semantics**: both have `start_date`/`end_date`/`parent_rule_id` version chains, both
re-price by archive-and-successor, both feed `recurringUtils.generatePaymentDates`. They are
edited by different code in different places — `Income.jsx` for one, `RecurringRules.jsx` for the
other — and only the shared re-pricing logic was ever extracted, into
`recurringAmountUpdate.js`. That file's own header explains the split it did *not* resolve: the
Income page's editor re-versions while also applying name/frequency changes, so it keeps its own
duplicate write.

The versioning idea itself is right: never update an amount in place, so historical entries keep
the amount they were posted with. `updateRecurringAmount` even restores the archived version if
inserting the successor fails, and raises a specifically worded error if *that* also fails.

### 3.6 Settings, auth, multi-user

Thin and unremarkable, which is the goal. `settings` is one row per user created by the signup
trigger. The danger zone is the two-tier `reset_user_data` RPC, written specifically to replace a
client path that had been writing `wallets.balance` directly — that history is recorded in the
migration header.

Auth is Supabase email/password with a confirmation redirect (`App.jsx:39` sniffs
`type=signup` in the hash to show a welcome banner) and a separate `/reset-password` route.
Theme comes from `settings.theme`, re-fetched on every auth state change.

---

## 4. The data model as it actually is

**Core:** `wallets`, `transactions`, `income_entries`, `income_recurring`, `income_templates`,
`recurring_rules`, `budget_allocations`, `settings`.

**Distribution:** `income_distribution_rules`, `income_template_distribution_items`,
`unallocated_templates` + `unallocated_template_items`, `unallocated_plans` +
`unallocated_plan_items`, `unallocated_pending_conflicts`.

**Import:** `counterparty_wallet_mappings`, `imported_statements`, `recurring_import_links`,
`monthly_balance_snapshots`, plus `transactions.import_fingerprint` and `settings.bank_provider`.

### Dead or vestigial

- **`wallets.cap_reduction_enabled`** — documented dead, confirmed dead in code.
- **`wallets.colour`** — still written by `WalletModal.jsx:79`, still stored, but the UI identifies
  wallets by icon now (`walletIcons.js` + `<WalletIcon>`). The colour picker was removed in R2.
  `DESIGN-SPEC.md` §2 still carries five "wallet identity ramps" instructing you to "map existing
  wallet `colour` values onto these families" — a spec section describing a mechanism the UI no
  longer uses for wallets (the ramps *are* still used, for flow-diagram source colours).
- **`imported_statements`** — created 2026-07-26 and, by `PROJECT-CONTEXT.md`'s own admission,
  **written by nothing**. It is scaffolding for a future classic-uittreksel adapter. The doc
  helpfully says "don't 'fix' it by writing placeholder rows."
- **`budget_allocations`** — appears in the schema and in `reset_user_data`'s delete list. I found
  **no read or write of it anywhere in `src/`** (it is absent from every page's table list in
  `INVENTORY.md` §4). **INFERRED:** vestigial from a pre-distribution budgeting model.
- **`income_distribution_rules.amount`** — described as "legacy euro, kept in sync during
  transition" alongside the `mode`/`value` pair that superseded it. The transition never
  completed: `IncomeRecurringDetail.jsx:170` still distributes from `dr.amount`, not from
  `mode`/`value`.
- **`src/App.css`** (184 lines) — imported by nothing. `src/assets/{hero.png, react.svg,
  vite.svg}` and `public/icons.svg` — referenced by nothing.

### A latent correctness issue in the recurring log flow

`IncomeRecurringDetail.jsx:404` renders an **editable** amount field pre-filled with `rule.amount`.
The `income_entries` row is inserted with whatever the user types (`:160`), but the distribution at
`:170` maps `distributionRules` using **`dr.amount`** — the stored euro column — not by re-resolving
`mode`/`value` against the amount actually logged. Change the amount in that modal and the wallet
credits no longer sum to the income entry.

This is the same class of defect as the one already flagged in a comment at `Income.jsx:245`
("Editing the amount here… does NOT re-run distribution… leaving the income and its distribution
desynced"), reached from a different direction. The known one is flagged; this one is not.

---

## 5. The design system, and how theming actually works

The mechanism is a single-layer CSS-variable swap and it is genuinely elegant.

`src/index.css` declares 15 light tokens in Tailwind v4's `@theme` block, so `bg-cream`,
`text-ink-muted`, `border-card-border` etc. compile to `var(--color-*)`. A `.dark` block redefines
**the same variables**. `@variant dark (&:where(.dark, .dark *))` binds Tailwind's `dark:` variant
to that class, and `App.jsx:64` toggles `.dark` on `<html>` from `settings.theme`.

The consequence: **almost no component contains a `dark:` utility.** Dark mode is not a parallel
set of classes; it is the same classes resolving to different values. The pattern the CSS comment
calls out — `bg-ink text-cream` for primary buttons and active nav — inverts automatically because
both tokens flip.

Tokens that must *not* flip get their own names: `--color-accent-solid` (logo mark, checkboxes),
`--color-positive-bar`, `--color-negative-bar`, `--color-warning`. That distinction between "text
colour that shifts for contrast" and "solid fill that must stay put" is the part most token systems
get wrong.

Compliance is near-total. Zero `font-bold`/`font-semibold` anywhere in `src/`. Zero chart-library
imports; seven components hand-roll inline SVG. Every euro renders through `formatMoney()`. The
only file using raw Tailwind palette colours is **`src/App.jsx`** — the pre-session loading screen
(`bg-gray-50 dark:bg-gray-950`, `text-gray-400`) and the signup welcome banner (`bg-green-500
text-white`). Both are outside the shell and were plainly missed by the R1/R2 rollout, which is
exactly where you would expect a token migration to leave a gap.

Wallet identity is `wallets.icon` → a 12-entry lucide registry, with a per-type fallback. That
replaced colour as the identifier.

---

## 6. Testing strategy — what is protected and what is not

**352 tests, 24 files, all passing, 14 s.** The strategy is stated in `vitest.config.js`'s header
and honoured exactly: `environment: 'node'`, `include: ['src/**/*.test.js']`, no React plugins, no
globals. Only pure logic is tested.

**Well protected:** the import pipeline (~200 tests over 15 modules — the CSV adapter alone has 26
tests against a real 42-row fixture), distribution resolution (18), the budget model (20), flow
geometry (15), money formatting (15), recurring date generation (10).

**Not protected at all:**

- **Every page and every component.** ~9,000 lines of JSX, zero tests. `vitest.config.js` includes
  only `*.test.js`, so a `.test.jsx` would not even be collected.
- **`recurringAmountUpdate.js`** — 111 lines, writes to the database, re-versions rules, has an
  error-recovery path that restores an archived rule, and has **zero tests**, despite its own
  header calling it "the ONE definition of that write". This is the single largest coverage gap
  weighted by risk.
- **`dashboardCalcs.js`** — 268 lines, 10 exports, **6 tests**. Compare `walletMetrics.js`: 67
  lines, 3 exports, 12 tests. The reason is structural, not laziness: `walletMetrics` and
  `incomeMetrics` take an injectable `now = new Date()`, so their behaviour is pinnable;
  `dashboardCalcs` reads `new Date()` internally at lines 32, 76, 125 and 163, so most of it cannot
  be tested deterministically. `docs/testing-notes.md` records the deferral and
  `PHASE-ROADMAP.md` Phase 2 makes fixing it a requirement of the dashboard rebuild.
- **The DB functions themselves.** `import_transactions`, `edit_income_distribution`,
  `reset_user_data` and `distribute_from_unallocated` carry the app's atomicity guarantees and have
  no automated test. They were verified once, by hand, against the live DB; nothing re-checks them.

**CI runs `npm test` only** — not `npm run build`, not `npm run lint`.

---

## 7. Half-built, abandoned, or self-inconsistent

**Genuinely unfinished:**

- **Budgeting Phase C** exists as ~1300 lines on an unpushed local branch (`INVENTORY.md` §1.4) —
  a pure lib with 268 lines of tests, four new components, and a `PROJECT-CONTEXT.md` edit
  declaring it shipped. It is finished code in an unfinished state.
- **The dashboard rebuild** — `docs/dashboard-recon.md` (224 lines, untracked) is the recon for a
  redesign that never started. `PHASE-ROADMAP.md` Phase 2 is its plan.
- **Plan firing is never logged.** `unallocatedPlans.js:49`: `// HOOK: Stage 4e will log plan
  firings here.` An automatic distribution leaves transaction rows but no record that a *plan*
  caused it.
- **`imported_statements`** — a table with no writer.
- **Backup/restore and client-side encryption** — plan files written 2026-07-07, untouched since.

**Two patterns doing one job:**

- **Recurring income vs recurring expenses** (§3.5): two tables, two editors, near-identical
  semantics, one shared helper.
- **`round2`** — the same one-liner is copy-pasted into **nine** files (`INVENTORY.md` §7.6). Money
  rounding is the one thing you would want defined once, and `format.js` — the file that exists to
  be the single source for euros — deliberately excludes it ("NOT for calculation/rounding").
  Defensible in principle; the result in practice is nine copies.
- **Two commit mechanisms in Import** — plain transactions go through `import_transactions`,
  income credits go through the old `income_entries` + popup + `distributeIncome` path. The docs
  say this is on purpose ("kept separate on purpose"), and I agree it is, but it means one imported
  file can produce writes through both an atomic and a non-atomic path.
- **Amount editing that re-runs distribution vs amount editing that does not** — `Income.jsx:245`
  (flagged) and `IncomeRecurringDetail.jsx:170` (not flagged), §4 above.

**Inconsistent with itself:**

- `npm run lint` is a documented command that **fails** (33 errors), has failed for at least a
  release cycle, and is not run by CI. 11 of those errors are
  `react-hooks/static-components` — components created during render, which is a real re-mount bug
  class, not a style nit.
- `vite.config.js` pre-bundles `recharts`, a package that is not installed and that `CLAUDE.md`
  forbids.

---

## 8. What is risky for an autonomous agent to touch, and why

**Highest risk — do not modify without a human in the loop:**

1. **`distributeIncome.js`.** 64 lines, deceptively simple, and the only place four subsystems
   meet (distribution, caps, overflow routing, transaction recording). It is also non-atomic, so a
   "harmless" reordering of its RPC calls changes the failure mode. Its `isAutomated` flag is the
   sole entry point to the capped mechanic.
2. **`resolveCappedInflow.js`.** 28 lines with a conservation invariant that is easy to break by
   "cleaning up" the rounding — `overflow` is derived from the *rounded* `received` on purpose.
   `CLAUDE.md` rule 7 forbids simplifying it, which tells you it has been attempted.
3. **`unallocatedPlans.js`.** The conflict-stall logic is subtle: an agent optimising it would very
   plausibly "fix" the >1-eligible case by firing the first plan. That would silently move money
   the user never approved.
4. **Anything writing `wallets`.** The no-client-balance rule is enforced by convention alone
   (§2.1). An agent adding a field to `WalletModal`'s payload could breach the project's
   single hardest rule without touching any line that mentions `balance`.
5. **The reverse-then-reapply RPC pairs** in the five variable/payment components. They look like
   duplication begging to be extracted; extracting them without adding error handling would
   propagate the bug rather than fix it.

**Medium risk:**

6. **`Income.jsx` (1225 lines), `Import.jsx` (1194), `WalletDetail.jsx` (989).** Too large to hold
   in context safely. `WalletDetail` is the worst shape: three distinct wallet behaviours branching
   inside one component.
7. **`DistributionPopup.jsx`** — 15 props, four call sites, four modes. Any change must be
   validated against all four.
8. **Schema.** Rule 3 and the `db-migration` skill already gate this, and `supabase/migrations/`
   is not a complete schema definition, so an agent reasoning from the folder alone would be
   reasoning from a fifth of the schema.

**Low risk:** the pure `src/lib/` modules with real coverage, the `ui/` primitives, and the import
pipeline — well-factored, well-tested, well-commented.

---

## 9. What surprised me

Things I found true that are not stated in `CLAUDE.md` or `PROJECT-CONTEXT.md`:

1. **`npm run lint` fails, and CI does not run it.** `PROJECT-CONTEXT.md` normalises the count
   ("44 pre-existing problems, 0 new") — but a documented project command being red, with the
   safety net that would catch it switched off, is not a detail. 33 errors, including 11
   components-created-during-render.

2. **The capped-wallet mechanic has exactly one entry point in the whole app.** Rule 7 describes
   the mechanic in detail without mentioning that only "Log income" on a recurring income's detail
   page can reach it. A reader would reasonably assume recurring income posts automatically.

3. *(Not a surprise after all — recorded here because I initially took it for one.)* That nothing
   posts recurring income automatically **is** documented: `PROJECT-CONTEXT.md` §5 says "Recurring
   income does **not** fire automatically on a date, the user logs it manually from
   `IncomeRecurringDetail.jsx`." Confirmed in code — no scheduler, cron or edge function exists,
   and recurring *expenses* work the same way via `TransactionChecklist`'s manual tick-off. It is
   absent from `CLAUDE.md`, which is where a reader meeting the word "recurring" first lands.

4. **Six of the ten money paths are non-atomic**, and every one of them predates 2026-07-09. The
   docs celebrate each new transactional RPC without noting that the older paths were never
   brought up to the same standard.

5. **`vite.config.js` pre-bundles `recharts`** — uninstalled, absent from the lockfile, and
   explicitly forbidden by the project's own design rules.

6. **`budget_allocations` appears in the schema and in `reset_user_data`'s delete list but is read
   and written by no code in `src/`.** **INFERRED** from a full grep of page/component/lib table
   references.

7. **`src/App.jsx` is the only file in `src/` that never got tokenized.** Four raw Tailwind
   palette classes survive there, in the loading screen and welcome banner — the two views a new
   user sees first.

8. **The one-adapter registry.** `detectBank.ADAPTERS = [kbc]` covers only the PDF format; the CSV
   adapter is invoked directly and never registered. Sensible, documented in the code, and
   completely invisible from the project docs — which describe "two import sources" as if they
   share a routing layer.

9. **`ARCHITECTURE.md` is a 21-line retirement notice that nine files still reference**, including
   `CLAUDE.md` and `.claude/skills/db-migration/SKILL.md`.

10. **`main` has been untouched for five weeks** (last commit 2026-07-30). The most recent work —
    Budgeting Phase C — is sitting on an unpushed local branch. Neither the roadmap nor the current
    standing section reflects that pause.

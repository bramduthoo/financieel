# budgeting-page-plan.md — REPLACE §6, REPLACE prompt 10.C

> **How to merge.** This **replaces** §6 (Phase C) and **replaces** prompt 10.C in your existing
> `budgeting-page-plan.md`. Everything else in the file stands. Origin: owner review of the shipped
> B2 page (2026-07-21) — recommendations 1 and 2 approved, plus three carried-over fixes from that
> review that ride along in the same session (§6.0).

---

## 6. Phase C — Budget performance ("am I budgeting well?")

### 6.0 Carried-over fixes from the B2 review (do these first, same session)
Small, but they change what the top of the page says, so they land before the analytics.
1. **Delete the summary strip** (`INCLUDED INCOME / BUDGETED / COVERED / TO FREE POOL`). All four are
   dead weight: BUDGETED and COVERED are identical by construction (they only diverge when a wallet is
   underfunded), TO FREE POOL duplicates the Unallocated tile, and INCLUDED INCOME moves to the chart.
   **This is an explicit exception to DESIGN-SPEC §8 Rule 2** ("summary strip under every page
   header") — record it in DESIGN-SPEC the way Settings' exception is recorded.
2. **Underfunding surfaces on the tile, not in a strip.** The one thing the strip could tell you was
   "something is short". A tile below 100% already shows that; give it a `negative`-toned shortfall
   line (`€ X short`) so the failure case is visible without a whole strip existing for it.
3. **Chart labels show intent, not just outcome.** Income node → income name + **€ amount**. Wallet
   node → wallet name + **its monthly budget**. Where a wallet's allocation is **less** than its
   budget, show the shortfall in `negative`; free-pool wallets (Unallocated, investment) have no
   budget, so they keep showing the allocated amount. Ribbon thickness already encodes the allocation
   — the label's job is the target.

### 6.1 The two questions (keep them separate)
The page currently answers only "where is money supposed to go". Phase C adds two *different*
questions, and conflating them is the main design risk:

- **Execution — did the plan actually run this month?** Compares **planned inflow** (what the
  distribution says each wallet should receive) against **received** (credits actually created when
  the recurring income was logged). Diverges when the salary hasn't been logged yet, or when a capped
  wallet's inflow was throttled by the §4 mechanic.
- **Estimate quality — is the budget the right number?** Compares **spent** (debits) against the
  wallet's **budget**, over months. This is the owner's core ask: "if the planned amount kind of
  matches the budget or is deviating a lot." This is where the nudge lives.

Question 1 is a **status line**. Question 2 is the **chart**. Do not merge them into one bar.

### 6.2 Derivation (no schema change, no snapshots)
Per wallet, per calendar month (`month_start_day` was removed by decision — calendar months only):
- **spent** = sum of `transactions` where `type='debit'` on that wallet in that month.
- **received** = sum of `transactions` where `type='credit'` on that wallet in that month linked via
  `income_entry_id` to a recurring-income entry.
- **planned inflow** = that wallet's allocation from the included recurring incomes'
  `income_distribution_rules` (resolved to euros via `resolveDistribution`).
- **budget** = `wallets.budget` (current value — see the limitation below).

### 6.3 Accepted limitations (state them, don't paper over them)
1. **There is no budget history.** `wallets.budget` is today's value; changing it re-compares every
   past month against the new number. Accepted — the chart's question is "is my *current* estimate
   right?", which is exactly the right frame. But it must be **labelled honestly** ("vs current
   budget"), never implied to be a historical comparison. Snapshotting budgets monthly would need a
   schema change and is explicitly out of scope.
2. **Months where the recurring income was never logged have no `received` data.** Spending data
   still exists (debits are independent). So the estimate-quality chart works for any month with
   transactions; the execution status only works for logged months. Render "not logged" as a distinct
   state, never as €0 received.
3. **Sparse history.** Early months will have little or no data. Everything must degrade to an honest
   empty/insufficient-data state rather than a misleading zero.

### 6.4 Wallet-type handling (the honesty requirement)
Spending rhythm differs by type, and a naive per-month bar lies about two of them:
- **`fixed` (fixed-recurring)** — budget is a known hard amount; spent should track it closely every
  month. Per-month comparison is honest. Deviation is meaningful and rare (a rent increase).
- **`capped`** — per-month comparison is honest, but **inflow ≠ budget** when the wallet is at its
  ceiling and the §4 reduction throttles it. Show the realized inflow separately from the budget so
  the throttle isn't misread as underfunding.
- **`accumulating` (variable)** — **the trap.** Spending is lumpy by design: a €200/month holiday
  wallet may show €0 for six months then €1.200 once. Per-month bars would read as six months of
  massive underspend then one catastrophic overspend, when the estimate was perfect. For these
  wallets the honest measure is **cumulative** (total received vs total spent since a start point) or
  a **trailing average**, not a single month.
- **`unallocated` / `investment`** — no budget, no denominator. **Excluded** from this section
  entirely (consistent with the tiles' no-fabricated-ratio rule).

**Requirement:** the per-month bar chart is the default view, but every deviation *metric* and the
nudge use a **trailing 3-month average**, not a single month, so lumpy wallets aren't misjudged.

### 6.5 The nudge ("your estimate looks wrong")
Fires per wallet, shown **only where relevant** — never a row per wallet.
- **Eligibility:** at least 3 complete months of data, and — critically — **at least 3 months with
  non-zero spending**. This single condition is what stops the system nagging about a holiday fund
  that is behaving exactly as intended.
- **Trigger:** the trailing 3-month average spend deviates from the budget by more than a threshold
  (start at **20%**, put it in one named constant, don't scatter it) in the **same direction** across
  those months.
- **Output:** a short flag on the wallet plus a **suggested new budget** = the trailing 3-month
  average, rounded sensibly. Direction matters in the copy: consistently over → the budget is too
  low; consistently under → too high (money is being tied up that could go to the free pool).
- **Action:** the suggestion links to the existing wallet edit modal (the same one the tiles open)
  with the budget field focused. **It never writes the budget itself** — suggestion only.
- Suppress for `unallocated`/`investment`, for wallets with no budget, and where data is insufficient.

### 6.6 Layout & components
Lives in the **lower section** of the Budgeting page, beneath the chart + tiles row.
- **Execution status line** (compact, full width, top of the section): whether the recurring income
  has been logged this month and when, the amount received, and the split to wallets vs free pool.
  Distinct "not logged yet this month" state. One line — not a card grid, not a second summary strip.
- **Overall chart:** per-month **budgeted vs spent** across all must-fund wallets, last 6 months.
  Grouped or diverging bars, inline SVG, `positive`/`negative` tokens for under/over. This is the
  "how well am I budgeting" headline.
- **Attention list:** only wallets the nudge flagged, each with its trailing average, its budget, the
  suggested value, and the link into the edit modal. Empty state when nothing is flagged — that
  emptiness is a *good* result, so word it as such rather than as "no data".
- **Per-wallet detail on demand:** a compact per-wallet bar chart (spent vs budget by month) reachable
  for any wallet, not rendered for all of them by default. Small-multiples grid or a wallet selector —
  Claude Code proposes which in plan mode.
- All euro strings via `formatMoney()` **including inside SVG**, so privacy mode masks this section too.
- Inline SVG only (DESIGN-SPEC §6). Reuse `MetricBar` and the density primitives where they fit.
- Microcopy rule applies: no instructional paragraphs, no page subtitle (§12.6).

### 6.7 Pure functions & tests (the deferred `now` gap closes here)
All time-relative calcs go in `src/lib/` as pure functions with an **injectable `now` parameter** —
this is the deferred projection-test gap from `docs/testing-notes.md`, and Phase C is where the plan
of record says it closes. Suggested shape (Claude Code may refine in plan mode):
- `getMonthWindows({ now, months })` → the calendar-month boundaries.
- `computeWalletMonthlyActivity({ transactions, wallets, windows })` → per wallet per month
  `{ spent, received }`.
- `computeBudgetPerformance({ activity, wallets })` → per wallet `{ trailingAvgSpent, budget,
  deviationPct, direction, monthsWithData, monthsWithSpending }`.
- `detectBudgetDrift({ performance, thresholdPct })` → the flagged wallets + suggested budgets.

**Behaviour tests must cover:** month-boundary transactions (first and last day of a month, and the
day either side); wallets excluded for having no budget; the accumulating/lumpy case (zero-spend
months must **not** trigger a nudge); fewer than 3 months of data; months with no logged income
(`received` absent, not zero); capped wallets whose inflow was throttled; deviation exactly at the
threshold; and determinism under a fixed injected `now`. Date handling via date-fns on date-only
values — no UTC drift.

### 6.8 Decisions & assumptions (override if wrong)
1. **6 months** is the default window for the overall chart.
2. **20%** is the starting drift threshold, as one named constant.
3. **3 months with non-zero spending** is the nudge eligibility bar.
4. The nudge **suggests**, never auto-applies.
5. Comparison is against the **current** budget, labelled as such; no budget history, no snapshots.
6. Investment and Unallocated are **excluded** from this section.

---

## 10.C (REPLACEMENT) — Budget performance

"Feature: Budgeting performance section (Phase C of budgeting-page-plan.md §6). Branch
b/budgeting-performance. **Plan mode first.**

Read §6 in full (including §6.0), plus §1, §5 and §7 of budgeting-page-plan.md, DESIGN-SPEC.md (§6
charts, §8 density rules, and the microcopy rule), and `docs/testing-notes.md`. Then read the
Budgeting page components as built, `src/lib/dashboardCalcs.js`, `src/lib/resolveDistribution.js`,
`src/lib/format.js`, and the transaction/income query paths. Confirm the live schema read-only via
the Supabase MCP.

**Present a full plan and wait for approval before writing any code.** The plan must cover: the pure
calc functions and their exact signatures (including where `now` is injected), how spent / received /
planned / budget are each derived, the layout of the new lower section, which chart form you propose
for the overall view and for per-wallet detail, the nudge heuristic, the DESIGN-SPEC/design-check
edits, and the full test list. **No schema changes — if you think one is needed, STOP and say so. Do
not change `distributeIncome.js`, any balance-writing path, or any RPC signature. Report exactly what
you changed per file.**

**Part 1 — carried-over fixes (§6.0), do these first.**
(a) Delete the summary strip (INCLUDED INCOME / BUDGETED / COVERED / TO FREE POOL) — all four values
are duplicated elsewhere or belong on the chart. Record the removal in DESIGN-SPEC as an explicit
exception to §8 Rule 2, alongside the existing Settings exception.
(b) A wallet tile below 100% shows a `negative`-toned shortfall line (`€ X short`) — that replaces the
strip's only real function.
(c) Flow-chart labels show **intent**: income node = name + € amount; wallet node = name + **its
monthly budget**. Where allocation is less than budget, show the shortfall in `negative`. Free-pool
wallets (Unallocated, investment) have no budget — they keep showing the allocated amount.

**Part 2 — the performance section**, in the lower half of the page, beneath the chart + tiles row.
Keep these two questions visually and structurally separate — do not merge them into one bar:
- **Execution status** (compact single line, top of the section): has the recurring income been logged
  this month, when, how much was received, and the wallets-vs-free-pool split. A distinct 'not logged
  yet' state — never render an unlogged month as €0 received.
- **Overall chart:** budgeted vs spent per calendar month across all must-fund wallets, last 6 months,
  inline SVG, `positive`/`negative` tokens for under/over.
- **Attention list:** only the wallets the nudge flagged — trailing average, current budget, suggested
  budget, and a link into the existing wallet edit modal with the budget field focused. It **suggests
  only, never writes**. When nothing is flagged, word the empty state as a good outcome, not as
  missing data.
- **Per-wallet detail on demand** (spent vs budget by month) — reachable for any wallet, not rendered
  for all of them by default. Propose small-multiples vs a selector in your plan.

**Honesty requirements — these are the point of the feature, not polish:**
- Comparison is against the **current** `wallets.budget`; there is no budget history. Label it 'vs
  current budget'. Do not imply a historical comparison and do not snapshot budgets.
- **Per-month spent-vs-budget is dishonest for `accumulating` wallets** — their spending is lumpy by
  design (a €200/month holiday wallet shows €0 for six months then €1.200). Every deviation metric and
  the nudge therefore use a **trailing 3-month average**, never a single month.
- `capped` wallets: inflow ≠ budget when throttled by the §4 cap mechanic. Show realized inflow
  distinctly so a throttle is never misread as underfunding.
- `unallocated` and `investment` wallets have no budget and are **excluded** from this section.

**Nudge rules:** eligibility = at least 3 complete months of data AND at least 3 months with non-zero
spending (this is what stops it nagging about a holiday fund behaving correctly). Trigger = trailing
3-month average deviates from budget by more than a threshold (start at 20%, as one named constant,
not scattered) in the same direction. Output = a flag plus a suggested budget equal to the trailing
average, sensibly rounded, with direction-aware copy (consistently over → budget too low;
consistently under → too high, money tied up that could go to the free pool).

**Calcs and tests:** all time-relative calcs are pure functions in `src/lib/` taking an **injectable
`now` parameter** — this closes the deferred projection-test gap in `docs/testing-notes.md`, so say so
in your plan and update that file. Suggested shape (refine if you have better): `getMonthWindows`,
`computeWalletMonthlyActivity`, `computeBudgetPerformance`, `detectBudgetDrift`. Behaviour tests must
cover: transactions on the first and last day of a month and the days either side; wallets excluded
for having no budget; the lumpy/accumulating case (zero-spend months must NOT trigger a nudge); fewer
than 3 months of data; months with no logged income (received absent, not zero); capped wallets with
throttled inflow; deviation exactly at the threshold; determinism under a fixed injected `now`. Use
date-fns on date-only values — no UTC drift.

**Rendering:** inline SVG only (a chart library import is a design-check violation). Every euro string
through `formatMoney()` **including inside SVG**, so privacy mode masks this section — verify with the
masked string that labels don't break. Reuse `MetricBar` and the §8 density primitives where they fit.
Microcopy rule applies: no page subtitle, no instructional paragraphs, at most one ≤10-word helper
line attached to a genuinely non-obvious control.

**Standard gates:** tests green including all the new `now`-injected calcs, `design-check` (incl. the
indigo/purple grep), code-reviewer, Playwright screenshots of the Budgeting page in **both themes**
covering: no data, partial history (<3 months), a flagged-wallet state, and privacy mode on;
db-verifier if any data path changed; wrapup — fold the outcome into budgeting-page-plan.md §11 and
its decision log, and update `docs/testing-notes.md` to mark the `now`-injection gap closed."

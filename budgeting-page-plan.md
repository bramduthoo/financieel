# budgeting-page-plan.md — Budgeting feature (phase context + kickoff prompts)

> Authoritative record for the **Budgeting** feature: the salary-driven distribution control/overview
> page, plus the capped-wallet mechanic fix it depends on, plus the planned-vs-used analytics. Holds
> every decision made for this feature so a fresh chat or Claude Code session can continue with full
> understanding. Companion to PROJECT-CONTEXT.md and DESIGN-SPEC.md; keep it current as the feature
> progresses (fold decisions back in, mark sub-phases done).

---

## 0. How to use this file (for the assistant and Claude Code)

- **Authoritative for this feature's intent, decisions, mechanic specs, and scope.** For anything
  outside this feature, PROJECT-CONTEXT.md governs. Ground-truth order is unchanged: **live Supabase
  DB > PROJECT-CONTEXT.md > CLAUDE.md**; this file is authoritative for *what the Budgeting feature is
  and how its pieces must behave*.
- **The feature ships as three sub-phases, one Claude Code chat each** (§2). Each has a kickoff prompt
  in §10. Do not drag the sub-phases into one session.
- **Claude Code, every sub-phase:** CLAUDE.md loads automatically. Also read this file (the relevant
  section), and where noted DESIGN-SPEC.md. Then **in plan mode**: read the real source files and
  verify the live schema/data via the read-only Supabase MCP; produce a full plan (files touched,
  the current→target diff for any behaviour change, the test list); **present it and wait for approval
  before writing any code.** Do not change logic, signatures, or queries beyond the stated scope;
  report exactly what changed. This is a money app — drift here moves real balances.
- **Migrations:** applied by the chat assistant via the write connector (shown → applied → verified
  read-only), never by Claude Code. Claude Code confirms schema read-only and STOPs if a required
  column is missing.
- **Money math** lives in pure `src/lib/` functions with behaviour tests; **balance writes** go
  through the existing `increment_wallet_balance` RPC and the existing transaction bookkeeping — never
  client-side balance arithmetic.

---

## 1. What the feature is

A **Budgeting** page that is both a control and an overview of how recurring income (the salary) is
distributed across wallets. The premise: a wallet's cap is the amount that wallet **needs each month**
(a hard requirement for fixed wallets, an estimate for variable ones), and that money flows in from
recurring income. The page makes caps meaningful and gives one place to see and steer the whole
salary → wallets picture.

The page has two halves:
- **Control (input → output).** Salary in, all must-fund wallets pinned to their cap out, leftover
  freely assignable to the free pool (Unallocated / investment). Editing here **is** editing the
  salary's distribution — same underlying rows (§5), so the two can never desync. Below the control, a
  **Sankey-style flowchart** of the distribution (Monarch-style: proportional ribbons + amount + %).
- **Overview (planned vs used).** A planned-vs-used bar view (red/green) over time, general and
  per-wallet, that recognises sustained over/under-estimation and suggests adjusting a cap (§6).

**Naming caution.** "Plans" already means `unallocated_plans` (threshold auto-distributions from
Unallocated) — do not reuse it. This feature is the **Budgeting** page. Pick route/component names that
don't collide with `unallocated_plans` or `budget_allocations` (e.g. `Budgeting`/`BudgetingPage`).

---

## 2. Sub-phases and sequencing

- **Phase A — Capped-wallet mechanic fix** (§4). Prerequisite. Touches the money core
  (`distributeIncome.js` + schema). Must be correct before B, because B pins capped wallets to their
  budget and relies on the executor applying caps sanely.
- **Phase B — Budgeting page** (§5). The control + Sankey flowchart. Mostly frontend over existing
  tables.
- **Phase C — Planned-vs-used analytics** (§6). Overview bars + the over/under nudge. Derived from
  history; no schema change expected.

Order: **A → B → C.**

---

## 3. Wallet model (verified live) and what caps mean

Live `type` × `budget_type` combinations (verified 2026-07-17; note the literal strings — PROJECT-
CONTEXT §4 is stale here):

| type | budget_type | role | cap meaning | in the plan |
|---|---|---|---|---|
| `fixed` | `fixed-recurring` | hard monthly need | `budget` = exact amount | pinned to budget |
| `variable` | `accumulating` | estimate, monitored | `budget` = estimate | pinned to budget |
| `variable` | `capped` | estimate + ceiling | `budget` + `cap_max` + rate + overflow | pinned to budget; executor applies the cap mechanic at log time (§4) |
| `investment` | `none` | free pool (savings stand-in) | no cap | free remainder target |
| `unallocated` | `unallocated` | free catch-all | no cap | free remainder target |

- **Only automated/recurring income applies caps.** Manual/template income ignores caps entirely
  (unchanged). The salary is recurring ⇒ automated ⇒ hits the cap logic.
- **No savings wallet type exists.** Investment wallets serve as the savings/free-pool target for now;
  a real savings type is a later, separate build. (Owner: "I switched savings with investments.")
- All current Supabase rows are **dummy data** — schema facts are real, row counts are not signal.

---

## 4. Phase A — Capped-wallet mechanic (authoritative spec)

### 4.1 The behaviour (what's wrong today, what it becomes)
Today a single "Monthly budget" number is **both** the budget and the reduction trigger, the reduction
hits the whole amount at that line, and overflow is hardcoded to Unallocated. There is no bug/crash —
the design is wrong. The redesign:
- **Splits `budget` (monthly inflow) from `cap_max` (the ceiling / reduction trigger).**
- **Reduce-to** semantics: the wallet *receives* `rate ×` the portion above the ceiling (rate `0.1`
  on a €100 budget → €10 received). `cap_reduction_rate` already means "fraction received" (default
  `1.0`), so its meaning is unchanged.
- Reduction **triggers only when balance ≥ `cap_max`**.
- **Fill-to-max, then reduce the remainder**: the part of the budget that brings balance up to
  `cap_max` flows in at 100%; only the part above `cap_max` is reduced.
- **Overflow** (`budget − received`) goes to a **configurable wallet, restricted to non-capped**
  targets, default Unallocated (`overflow_wallet_id` NULL ⇒ the user's Unallocated wallet).
- **The reduction on/off toggle is REMOVED.** A capped wallet **always** applies this mechanic. If a
  wallet shouldn't have a ceiling, it should be an `accumulating` variable wallet, not a `capped` one.
  `cap_reduction_enabled` is now a **dead column** (leave it; executor ignores it for capped wallets,
  per project convention of not migrating dead columns away).

### 4.2 The algorithm (pure, authoritative)
For a capped wallet receiving budget `B`, current balance `b`, ceiling `M = cap_max`, rate
`r = cap_reduction_rate`:
```
room     = max(0, M − b)
full     = min(B, room)
over     = B − full
received = full + over * r          → the capped wallet
overflow = B − received             → overflow wallet (== over * (1 − r))
```
Compute `overflow` as `B − received` (not independently) so `received + overflow == B` exactly.
Apply the project rounding discipline (nets within 0.005, per credit).

Canonical cases (become the rewritten tests):
| b | M | B | r | received | overflow | new balance |
|---|---|---|---|----------|----------|-------------|
| 190 | 200 | 50 | 0.5 | 30 | 20 | 220 |
| 220 | 200 | 50 | 0.5 | 25 | 25 | 245 |
| 190 | 200 | 50 | 0.0 | 10 | 40 | 200 (hard ceiling) |
| 0 | 200 | 50 | 0.5 | 50 | 0 | 50 (below ceiling → full) |

### 4.3 Schema (APPLIED & verified 2026-07-17 by the assistant)
```sql
ALTER TABLE public.wallets
  ADD COLUMN cap_max numeric,
  ADD COLUMN overflow_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL;
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_cap_max_nonneg     CHECK (cap_max IS NULL OR cap_max >= 0),
  ADD CONSTRAINT wallets_overflow_not_self  CHECK (overflow_wallet_id IS NULL OR overflow_wallet_id <> id);
```
- `cap_max` nullable in DB (UI-required for capped — see 4.4). `overflow_wallet_id` NULL ⇒ Unallocated;
  `ON DELETE SET NULL` ⇒ deleting the target falls back to Unallocated. Self-overflow blocked.
- Not enforced in DB (UI-side): `cap_max >= budget`, and overflow target is non-capped.
- Verified live: both columns present + both constraints present. `cap_reduction_rate` (default 1.0)
  and `cap_reduction_enabled` (default false, now dead) untouched.

### 4.4 Executor, UI, tests (Claude Code)
- **Executor:** implement 4.2 as a pure `src/lib/` function (e.g. `resolveCappedInflow({balance,
  budget, max, rate}) → {received, overflow}`) with unit tests. Wire it into the automated/`capped`
  branch of `distributeIncome.js`, replacing the current single-cap logic. Resolve overflow target
  (`overflow_wallet_id` else the user's Unallocated). Credit wallet + overflow via
  `increment_wallet_balance` and match the existing overflow transaction bookkeeping (one credit row
  per credit, `income_entry_id` stamping where current code does it). No client-side balance math.
- **Settings UI** (the "Cap reduction settings" component): for capped wallets, make **budget, `cap_max`
  (new "Maximum balance"), and the receive-% (`cap_reduction_rate`) all required** (can't save blank;
  suggest validation `cap_max >= budget`). Add an **overflow-destination selector** (non-capped wallets
  only, default Unallocated). **Remove the enable/disable reduction toggle.** Rewrite the help copy to
  the new semantics (fill to the maximum at full rate; the part above is reduced to the chosen %; the
  remainder goes to the chosen overflow wallet). Style per DESIGN-SPEC; run `design-check`.
- **Tests:** **rewrite** the automated capped-branch behaviour tests in the `distributeIncome` suite
  (they encode the OLD single-cap behaviour — replace, do not preserve). Keep the manual/template
  "caps ignored" tests and the `income_entry_id`-stamping test. Cover every 4.2 row plus overflow-to-
  Unallocated (NULL), overflow-to-chosen-wallet, sum-preservation, rounding within 0.005, and unit
  tests on the pure function directly.

---

## 5. Phase B — Budgeting page

- **Plan = the salary's `income_distribution_rules`, edited in place** (same rows ⇒ control and
  recurring distribution can never desync). This is the whole point of the "edit one, the other
  follows" requirement.
- **Must-fund wallets (`fixed`, `accumulating`, `capped`) are pinned to their `budget`.** Leftover
  salary is freely assignable to the **free pool (Unallocated / investment)**. You **cannot exceed a
  wallet's budget** on this page — excess always goes to the free pool, so there is no overflow-beyond-
  budget case here.
- **Capped wallets:** the plan line = the wallet's `budget` (nominal intent). The executor still
  applies the §4 cap mechanic at log time, so the *realized* inflow can differ from the plan line month
  to month. The page shows intent; note the realized number is dynamic (this is also what Phase C
  visualises).
- **Percent handling:** the page is euro/cap-based. At least one live rule is `percent` mode — convert
  or handle it when pinning to euros; don't silently corrupt it.
- **Empty state:** if there is no recurring income and/or no wallets set up, show a blank page prompting
  the user to set up a recurring income and wallets first.
- **Multiple recurring incomes (deferred, but 1 live user already has >1):** v1 must render a defined
  state, not break. Each recurring income stays tied to its own distribution rule; the page **aggregates
  them by total** for the overview but keeps each income **separate in the input/flowchart** so each can
  be adjusted independently (so you can stop excess money flowing to a wallet). Full multi-income
  editing UX is a later refinement; v1 = correct aggregated display + per-income separation, no
  cross-income auto-balancing.
- **Retroactivity (ASSUMPTION — confirm):** editing the plan affects **future logs only**, not income
  already logged this month. No rewrite of past `transactions`.
- **Sankey flowchart:** salary → wallets, ribbon width ∝ amount, labelled with amount + %, Monarch-
  style reference. **Inline SVG only** (DESIGN-SPEC §6 bans chart libraries) — a two-column proportional-
  ribbon diagram, theme-aware via tokens. This is the most custom visual in the feature.
- **No schema change expected.** If any arises, db-migration skill + STOP for the assistant to apply.

---

## 6. Phase C — Planned-vs-used analytics

- **Planned-vs-used bars, general and per-wallet, red/green** over time.
- **Data source (no snapshots needed):** *planned* inflow per wallet per month = the credits linked to
  that month's logged recurring income via `income_entry_id`; *used* = that month's `debit`
  transactions on the wallet. Both fully derivable from history. **Dependency:** data exists only for
  months where the recurring income was actually logged (it does not auto-fire).
- **Over/under nudge:** when a wallet's used vs planned diverges consistently (e.g. ~3 months), flag it
  and suggest adjusting the cap. Surface per-wallet **only where relevant**, not for every wallet.
- **Testability requirement:** all new time-relative calcs take an **injectable `now` parameter** and
  ship with behaviour tests (this is the deferred projection-test gap from `docs/testing-notes.md`;
  doing it here is consistent with the dashboard-rebuild deferral).
- **Inline SVG charts** per DESIGN-SPEC §6. **No schema change expected.**

---

## 7. Decision log (the why)

- **Plan is the salary's distribution rules, not a separate layer** — editing the same rows makes
  "edit one, the other follows" structural, not a sync problem.
- **Must-fund wallets pinned to budget; remainder free to Unallocated/investment** — you can't exceed a
  wallet's budget on the page; excess has an obvious home in the free pool.
- **Reduce-to semantics** (receive `rate ×` amount) — matches the existing `cap_reduction_rate` meaning
  and is more intuitive ("receive 10% → get €10").
- **Ceiling separate from budget + fill-to-max-then-reduce-remainder** — the old design reduced against
  the budget itself, which meant a €50-budget wallet started reducing at €50; the point of the ceiling
  is to accumulate up to `cap_max` first, then throttle.
- **Reduction on/off toggle removed** — redundant with wallet-type choice; a no-ceiling wallet is an
  `accumulating` variable wallet. Keeps capped semantics unambiguous. `cap_reduction_enabled` left dead.
- **Overflow restricted to non-capped wallets this phase** — structurally prevents "overflow into a
  wallet that's itself at max," so the halt-and-redirect conflict flow isn't needed yet (deferred, §8).
- **Multi-income aggregation deferred** — v1 shows a defined aggregated state and keeps incomes separate
  in the input/flowchart; full multi-income editing is later.
- **Investment wallets stand in for savings** — no savings type exists yet; real savings is later.
- **Money math in pure `lib/` + behaviour tests; migrations by the assistant** — the project's standing
  rule; behaviour tests survive the future encryption migration.
- **Planned/used derived from `income_entry_id` credits + debits** — no monthly snapshots, history is
  self-describing; the only cost is that unlogged months have no data.

---

## 8. Deferred / explicitly out of scope

- Configurable overflow into **any** wallet + the **halt-and-redirect conflict flow** (reuse the
  multi-plan stall pattern + `unallocated_pending_conflicts`) when the overflow target is itself a
  capped wallet at its max.
- The Unallocated feature that **flags overspent/negative wallets and offers to top them up to neutral**
  (distinct from capped positive overflow).
- **Full multi-income support** (cross-income balancing / per-income editing UX).
- A **real savings wallet type**.

---

## 9. Open items to confirm (before or during the relevant sub-phase)

1. **Retroactivity** (§5): edits affect future logs only, not already-logged income this month?
   (assumed yes.)
2. **Sankey vs simpler chart** (§5): Monarch-style proportional-ribbon Sankey assumed as the target.
3. **Phase B / C schema**: expected to need none; confirm once Claude Code has read the real code.

---

## 10. Kickoff prompts (one per sub-phase — paste into a fresh Claude Code session)

> Each new Claude Code session = a new chat. Attach: PROJECT-CONTEXT.md + this file (+ DESIGN-SPEC.md
> for B and C). Every prompt is plan-mode-first and requires an approved plan before any code.

### 10.A — Capped-wallet mechanic fix
"Feature: capped-wallet mechanic redesign (Phase A of budgeting-page-plan.md). Branch
b/capped-wallet-fix. **Plan mode first.** Read §4 of budgeting-page-plan.md, then read
`src/lib/distributeIncome.js` (the automated/`capped` branch) and the wallet create/edit settings
component (the 'Cap reduction settings' card), and confirm the live `wallets` schema via the read-only
Supabase MCP — columns `cap_max` and `overflow_wallet_id` and constraints `wallets_cap_max_nonneg` /
`wallets_overflow_not_self` are already applied; verify they exist, STOP if not. **Present a full plan
— files touched, a current→target diff of the capped logic, and the test list — and wait for approval
before writing any code. Do not change anything beyond this scope; report exactly what you change.**
Target behaviour (authoritative, §4.2): room=max(0,M−b); full=min(B,room); over=B−full;
received=full+over*r; overflow=B−received (→ overflow wallet). Reduce-to semantics. Trigger only at
balance≥M. **Remove the reduction enable/disable toggle** — capped wallets always apply the mechanic;
`cap_reduction_enabled` is dead and ignored. Overflow target: `overflow_wallet_id` else the user's
Unallocated; restrict the settings selector to non-capped wallets, default Unallocated. Settings UI:
budget, `cap_max` ('Maximum balance'), and receive-% all required (can't save blank; validate
cap_max>=budget), plus the overflow selector, plus rewritten help copy — per DESIGN-SPEC, run
design-check. Keep the money math in a pure `src/lib/` function with unit tests; writes stay via
`increment_wallet_balance` + the existing overflow bookkeeping — no client-side balance math. **Rewrite
only** the automated capped-branch behaviour tests in the distributeIncome suite (they encode the old
single-cap behaviour); keep the manual/template cap-ignoring tests and the `income_entry_id`-stamping
test. Canonical cases: (190,200,50,0.5)→30/20; (220,200,50,0.5)→25/25; (190,200,50,0.0)→10/40; below
ceiling→full; sum-preservation received+overflow==B; rounding within 0.005; overflow to NULL/Unallocated
and to a chosen non-capped wallet. Standard gates: rewritten tests green, design-check (incl.
indigo/purple grep), code-reviewer, Playwright screenshots of the capped settings both themes,
db-verifier invariants on a logged capped batch, wrapup."

### 10.B — Budgeting page
"Feature: Budgeting page (Phase B of budgeting-page-plan.md). Branch b/budgeting-page. **Plan mode
first.** Read §5 (and §1, §3) of budgeting-page-plan.md and DESIGN-SPEC.md, then read the recurring-
income + distribution code (`income_distribution_rules` read/write paths, `IncomeRecurringDetail.jsx`),
`DistributionPopup.jsx`, and `WalletDetail.jsx`; confirm the live schema read-only. **Present a full
plan — page/route, components reused vs new, exactly how the plan reads/writes
`income_distribution_rules`, the Sankey approach, and the empty/multi-income states — and wait for
approval before writing any code. Do not change balance logic or RPC signatures; report exactly what
you change.** Requirements: the plan edits the salary's `income_distribution_rules` **in place** (same
rows); must-fund wallets (`fixed`, `accumulating`, `capped`) pinned to `budget`; remainder freely
assignable to the free pool (Unallocated / investment); a wallet's budget cannot be exceeded on this
page. Capped wallets: plan line = `budget` (the executor applies the cap mechanic at log time — show
intent, note realized inflow is dynamic). Handle the one `percent`-mode rule when pinning to euros.
Empty state when no recurring income and/or no wallets. Multiple recurring incomes: render a defined
aggregated state (aggregate by total; keep each income separate in the input/flowchart), do not break —
full multi-income UX is deferred. Sankey flowchart: salary→wallets, ribbon width ∝ amount, amount + %
labels, **inline SVG only** per DESIGN-SPEC §6, theme-aware via tokens. Reuse the density primitives
(SummaryStrip/CompactRow/etc.) per DESIGN-SPEC §8 where they fit. **No schema change expected**; if any
arises, db-migration skill + STOP for the owner to apply. Standard gates: tests, design-check
(incl. purple grep), code-reviewer, Playwright screenshots both themes, db-verifier if any data paths
changed, wrapup."

### 10.C — Planned-vs-used analytics
"Feature: Budgeting analytics (Phase C of budgeting-page-plan.md). Branch b/budgeting-analytics. **Plan
mode first.** Read §6 (and §1) of budgeting-page-plan.md, DESIGN-SPEC.md §6, `docs/testing-notes.md`,
and `src/lib/dashboardCalcs.js`; confirm the live schema read-only. **Present a full plan — the calc
functions (signatures, the injectable `now`), the derivation of planned vs used, the nudge heuristic,
and the chart components — and wait for approval before writing any code.** Requirements: planned-vs-
used bars (general + per-wallet, red/green) where *planned* per wallet per month = credits linked via
`income_entry_id` to that month's logged recurring income and *used* = that month's debit transactions;
a per-wallet over/under nudge (~3 months of consistent divergence ⇒ suggest adjusting the cap), shown
only where relevant. **All new time-relative calcs take an injectable `now` parameter and ship with
behaviour tests** (closes the deferred projection-test gap in testing-notes). Charts inline SVG per
DESIGN-SPEC §6. No schema change expected. Standard gates: tests (incl. the `now`-injected calcs),
design-check, code-reviewer, Playwright screenshots both themes, wrapup."

---

## 11. Current standing

- **Phase A schema: APPLIED & verified (2026-07-17).** `cap_max`, `overflow_wallet_id` + constraints
  live. `cap_reduction_enabled` retired to a dead column (toggle removed).
- **Phase A build: DONE (branch `b/capped-wallet-fix`, 2026-07-17).** Pure `src/lib/resolveCappedInflow.js`
  (§4.2) + unit tests; wired into the automated `capped` branch of `distributeIncome.js`; `WalletModal`
  capped card rewritten (required budget/`cap_max`/receive-%, overflow selector, toggle removed, dead
  `cap_reduction_enabled`). 103 tests green + design-check + code-reviewer (clean) + db-verifier PASS on
  a live 3-log capped batch (below-ceiling fill AND the 100/100 reduction/overflow case reconcile to the
  cent). PR to open.
- **Phases B, C:** not started; plans/prompts ready (10.B, 10.C). Open items §9 to confirm.

*Keep this section and §7 current as sub-phases complete.*

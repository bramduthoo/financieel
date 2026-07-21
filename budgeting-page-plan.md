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

## 9. Open items — CONFIRMED by owner 2026-07-17 (for Phase B)

1. **Retroactivity — CONFIRMED.** Plan edits affect **future incomes/logs only**; already-logged
   income this month and its `transactions` are untouched (no past rewrite).
2. **Sankey fidelity — CONFIRMED.** Full **Monarch-style proportional-ribbon Sankey** is the v1
   target (salary → wallets, ribbon width ∝ €, amount + % labels, inline SVG per DESIGN-SPEC §6).
3. **Leftover / free-pool routing — CONFIRMED.** After must-fund wallets are pinned to budget, the
   remainder **defaults entirely to Unallocated**, with the ability to reassign it to investment
   wallet(s). No exceeding a wallet's budget on the page.
4. **Multiple recurring incomes — CONFIRMED.** v1 = **aggregate-by-total overview + each income kept
   separate/editable in the input/flowchart** (no cross-income auto-balancing). Full multi-income UX
   deferred.
5. **Percent-mode rules — CONFIRMED.** A `percent`-mode distribution rule is **kept as percent**
   (not converted to euro on save) and only **displayed** as euros — don't silently corrupt it.
6. **Route & nav — CONFIRMED.** Page lives at **`/budgeting`** with a **"Budgeting" top-level nav
   item** alongside Dashboard / Wallets / Income / Settings.
7. **Phase B schema — CONFIRMED one column needed.** Persisting the include-in-plan selection required
   `income_recurring.include_in_budget` (bool NN default true) — drafted, owner-applied & verified
   2026-07-19. (Original assumption "no schema" no longer holds; the flag is what makes the plan
   remembered + lets Phase C read "the plan".)

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

### 10.D — Shared page header (cross-page, run first)
"Feature: shared PageHeader primitive (Phase B2-1 of budgeting-page-plan.md §12.1). Branch
b/page-header. **Plan mode first.** Read §12.1 + §12.7 of budgeting-page-plan.md and DESIGN-SPEC.md
(§3 typography, §4 components, §7 design-check table, §8 density rules), then read `src/components/ui/`
and **every** page component (Dashboard, Wallets, WalletDetail, Income, IncomeRecurringDetail,
Budgeting, Settings, Login, ResetPassword). **First deliverable in your plan is an inventory: how each
page currently renders its title today — element, font size, weight, spacing, wrapper — and exactly
which inconsistencies exist.** Then propose the rollout. **Present the plan — inventory, the PageHeader
API, files touched, the DESIGN-SPEC/design-check edits — and wait for approval before writing any code.
This is a pure presentation change: do not change routing, data fetching, queries, or any business
logic; report exactly what you changed per file.**
Build `PageHeader` in `src/components/ui/`: title 26–28px `font-medium tracking-tight text-ink` (never
bold/semibold — DESIGN-SPEC §3 allows only weights 400/500); optional **eyebrow** slot (11px uppercase
`tracking-wider text-ink-muted`) for detail pages; optional right-aligned **actions** slot vertically
centred with the title; bottom hairline `border-b border-card-border` across the content width with
consistent spacing above/below; **no subtitle slot at all** — this is deliberate, page-level
explanatory subtitles are being removed project-wide (§12.6). Not sticky. Both themes via existing
tokens; introduce no new colour tokens.
Roll it out to every page listed above, deleting each page's bespoke title markup **and any page-level
subtitle/instructional paragraph** you find while doing so (§12.6). Then update DESIGN-SPEC.md (§4
component entry, §7 table rows for the header pattern and the no-subtitle rule) and mirror both into
`.claude/skills/design-check/SKILL.md`.
Standard gates: tests green, `design-check` **on every page you touched** (incl. the indigo/purple
grep), code-reviewer, Playwright screenshots of every touched page in **both themes**, wrapup."

### 10.E — Budgeting page rework
"Feature: Budgeting page rework (Phase B2-2 of budgeting-page-plan.md §12). Branch b/budgeting-rework.
**Plan mode first.** Read §12 (all of it) and §5 + §7 of budgeting-page-plan.md, DESIGN-SPEC.md (§2
tokens and identity ramps, §4 components, §6 charts, §7 table, §8 density rules), then read the
Budgeting page components as built, `src/lib/resolveDistribution.js`, `DistributionPopup.jsx`, the
wallet edit modal component (the 'Cap reduction settings' one), and `src/lib/format.js`. Confirm the
live schema read-only via the Supabase MCP. Depends on branch b/page-header having landed — use the
shared `PageHeader`.
**Present a full plan and wait for approval before writing any code**, covering: the two-column layout,
the component inventory (new vs reused vs deleted), the **Sankey geometry function signature and the
label de-collision approach**, the editor state model and exactly how it calls `resolveDistribution`,
the read/write path to `income_distribution_rules`, the DESIGN-SPEC/design-check edits, and the test
list. **Do not change `distributeIncome.js`, any balance-writing path, or any RPC signature. No schema
changes — if you think one is needed, STOP and say so. Report exactly what you changed per file.**
Work items:
(1) **Empty state** — remove the card; centre it horizontally and vertically on the page background;
headline `text-ink-muted`, supporting line `text-ink-faint`; keep both action buttons and their routing.
(2) **Layout** — flow chart card left (~2/3); right rail (~1/3) with a 2-across grid of compact wallet
tiles; directly beneath the tiles a full-rail-width primary `Apply auto-distribution` button. **Delete
the 'Budget coverage' card.** Stack the columns on narrow viewports.
(3) **Tiles** — name (13px), **% of budget funded** as the one prominent number (18px `font-medium
tracking-tight`), allocated amount (11px `ink-muted`); `rounded-[11px] border border-inner-border`;
positive colour at/over 100%, ink when short, muted when unallocated; **no bar**. Must-fund wallets
(fixed/accumulating/capped) show the %; free-pool wallets (Unallocated, investment) show amount +
'free pool' and **no %** — never a fabricated ratio. Tiles are real `<button>`s that open the
**existing wallet edit modal in place**; on save, recompute tiles + chart + summary strip.
(4) **Single-income Configure view: delete it.** Tiles + `Apply auto-distribution` replace it. Keep the
Configure view and the distribution editor for the multi-income case. `Apply auto-distribution`
overwrites manual allocations, so it must **confirm before writing**.
(5) **Flow chart** — one card, one inline SVG, **all included incomes combined** (not one chart per
income). Left nodes = incomes, right nodes = wallets, stacked ribbons where a wallet is fed by several
incomes. One colour per income, assigned deterministically from the DESIGN-SPEC §2 identity ramp bar
stops (`#378ADD`, `#639922`, `#D4537E`, `#7F77DD`, `#EF9F27`) — invent no hues. Ribbons take the
**source income's** colour at ~0.22 alpha light / ~0.30 dark, raised on hover. Nodes ~8px wide,
`rounded-[4px]`; income nodes coloured, wallet nodes neutral, **Unallocated coral `accent`**. Minimum
node/ribbon thickness ~3px. **Label de-collision is required** — push-apart pass plus a thin leader
line when a label is displaced (the current chart overlaps `sport` with `supermarkt`). Bounded chart
height (~320–420px), not proportional to income size. **Every euro string via `formatMoney()`,
including inside the SVG, so privacy mode masks the chart** — verify the masked string doesn't break
label layout. **Put the geometry in a pure `src/lib/` function** (nodes, link paths, label positions)
with unit tests — proportions sum, min heights respected, no NaN on zero/empty flows, deterministic
de-collision. The component only renders what it returns. Inline SVG only; a chart library import is a
design-check violation.
(6) **Distribution editor** (multi-income) — per-row €/% segmented toggle, mixed freely across rows,
per DESIGN-SPEC §4. **Reuse `src/lib/resolveDistribution.js` (`resolveRowExact` / `resolveDistribution`)
— do not reimplement the euro/% maths**; `%` is of that income's amount (the app-wide '% always of
total input' rule). Add a per-row **'fund to budget' checkbox** that fills that wallet's allocation
from this income: the wallet's **remaining shortfall** (budget minus what other included incomes
already allocate to it), falling back to the full budget when nothing else funds it, **clamped to the
income's unassigned remainder** so an income can never be over-allocated. Add a **per-wallet funding
bar aggregated across ALL included incomes** (`sum of allocations to that wallet / wallet.budget`),
rendered identically in every income's row for that wallet — a wallet fully funded by one income reads
100% everywhere; one fed 40/60 by two incomes reads 100% in both. Use the `MetricBar` primitive; give
over-funding (>100%) a distinct state rather than silently clipping. Live recompute as values change;
each income's unassigned remainder still flows to Unallocated and is shown as a footer row on that
income's card. **Persistence unchanged: write to `income_distribution_rules` in place, storing mode +
raw value (Option A), never resolved euros; no client-side balance math.**
(7) **Microcopy** — delete the page subtitle and the instructional paragraphs on this page (§12.6
lists them). Labels, numbers and empty states carry the meaning; at most one ≤10-word helper line
attached to a genuinely non-obvious control, never to the page.
(8) **DESIGN-SPEC + design-check** — add the card-less centred empty-state pattern, the compact metric
tile pattern (with its explicit exception to §8 Rule 1's hero-number/MetricBar requirement), and the
flow-diagram colour rules (income-coloured ribbons from the identity ramps, neutral wallet nodes,
coral Unallocated). Mirror all three into `.claude/skills/design-check/SKILL.md`.
Standard gates: tests green (incl. the new Sankey-geometry and funding-aggregation unit tests),
`design-check` (incl. the indigo/purple grep), code-reviewer, Playwright screenshots of the Budgeting
page in **both themes** covering all three states — empty, single-income, multi-income — plus one
screenshot with privacy mode on to prove the chart masks, db-verifier if any data path changed,
wrapup (fold the outcome back into budgeting-page-plan.md §11 and its decision log)."
---

## 11. Current standing

- **Phase A schema: APPLIED & verified (2026-07-17).** `cap_max`, `overflow_wallet_id` + constraints
  live. `cap_reduction_enabled` retired to a dead column (toggle removed).
- **Phase A build: DONE (branch `b/capped-wallet-fix`, 2026-07-17).** Pure `src/lib/resolveCappedInflow.js`
  (§4.2) + unit tests; wired into the automated `capped` branch of `distributeIncome.js`; `WalletModal`
  capped card rewritten (required budget/`cap_max`/receive-%, overflow selector, toggle removed, dead
  `cap_reduction_enabled`). 103 tests green + design-check + code-reviewer (clean) + db-verifier PASS on
  a live 3-log capped batch (below-ceiling fill AND the 100/100 reduction/overflow case reconcile to the
  cent). **Merged to `main` via PR #14 (2026-07-21)** together with Phase B.
- **Phase B build: DONE (branch `b/capped-wallet-fix`, 2026-07-19; A + B in one PR).** New `/budgeting`
  page + nav; pure `budgetPlan.js`/`sankeyLayout.js` (+tests); inline-SVG `SalarySankey`. Multi-income
  built in (plan-level coverage; `income_recurring.include_in_budget` flag, applied+verified). Edits each
  income's `income_distribution_rules` in place; save-verification modal. 114 tests green, build clean,
  code-reviewer (no criticals), design-check, both-theme render verified. Owner runs the multi-income /
  setup-Apply Playwright + db-verifier locally. §9 items all confirmed (see §9).
  **Merged to `main` via PR #14 (2026-07-21)** — `origin/main` @ `9fa639e`.
- **Phase B2-1 (shared `PageHeader`): DONE (branch `b/page-header`, 2026-07-21).** New
  `src/components/ui/PageHeader.jsx` (eyebrow / icon / title / meta / actions + bottom hairline),
  rolled out to all 7 app-shell pages; the four instructional page subtitles deleted; the two ad-hoc
  `ArrowLeft` back-buttons replaced by the eyebrow parent-link. DESIGN-SPEC §4 + §7 and the
  `design-check` skill updated (incl. a new bare-`<h1>` grep). 114 tests green, build clean, zero new
  lint issues, design-check clean, code-reviewer (no criticals), Playwright both themes × 7 pages.
  **One owner-approved override of §12.1 — see §12.8 item 1.**
- **Phase B2-2 (Budgeting page rework):** not started; prompt ready (10.E), and it now consumes
  `PageHeader`.
- **Phase C:** not started; prompt ready (10.C).

*Keep this section and §7 current as sub-phases complete.*

---

## 12. Phase B2 — Budgeting polish & design-system fixes

Origin: owner review of the shipped Phase B (2026-07-20, screenshots of the live page at
`localhost:5174/budgeting`). Six issues. Four of them are **design-system-level**, not page-level — if
they're fixed only inside the Budgeting page they will drift back on the next page built. So this phase
updates `DESIGN-SPEC.md` and the `design-check` skill table as well as the page (same pattern as R1).

**Splits into two sessions:** **B2-1** (cross-page page header — touches every page) and **B2-2**
(Budgeting page rework). B2-1 first; the Budgeting page consumes the new header.

### 12.1 Item 1 — Page titles (cross-page) → `PageHeader` primitive
Page titles are inconsistent across pages and read as unstyled. Fix = **one shared primitive**, used
by every page, specced in DESIGN-SPEC.

Proposed spec (confirm — see §12.8):
- New `PageHeader` in `src/components/ui/`, used by **every** page. No page renders a bare `<h1>`.
- **Title:** 26–28px, `font-medium tracking-tight`, `text-ink`. Never bold/semibold (DESIGN-SPEC §3:
  two weights only, 400 + 500).
- **Eyebrow slot** (optional, detail pages only): 11px uppercase `tracking-wider text-ink-muted`,
  e.g. `WALLETS` above a wallet name — gives WalletDetail / IncomeRecurringDetail a consistent parent
  affordance instead of ad-hoc back links.
- **Actions slot** (optional, right-aligned, vertically centred with the title) for page-level buttons.
- **Bottom hairline** `border-b border-card-border` spanning the content width, consistent spacing
  above (~4px page top padding) and below (~24px) before the SummaryStrip or first card.
- **NO subtitle slot.** Deliberate: this is what structurally enforces item 6 (§12.6) instead of
  relying on discipline. A page that "needs" a subtitle is a page with an unclear title.
- Not sticky in v1 (`main` is the scroll container per PROJECT-CONTEXT; sticky adds risk for no
  current need).
- Both themes via existing tokens; no new colour tokens.

### 12.2 Item 2 — Empty state
Current: white card, left-ish, boxed. Target: **no card**, centred in the content area, text quieter
than the surface it sits on.
- No `card` background, no border. Sits directly on `cream` / dark page bg.
- Horizontally **and** vertically centred in the available content area.
- Headline `text-ink-muted` (`#888780`), supporting line `text-ink-faint` (`#B4B2A9`). Deliberately
  lower contrast than body text — this is an absence, not content.
- Keep both action buttons and their routing (the coupling to Income / Wallets is the good part):
  primary `Add recurring income`, secondary `Set up wallets`, per DESIGN-SPEC §4 button styles.
- Copy: short. Headline states the requirement; one supporting line maximum (§12.6).
- **This is a DESIGN-SPEC addition** ("empty states are card-less, centred, muted"), because
  DESIGN-SPEC §4 otherwise implies everything lives in a card and `design-check` would flag it.

### 12.3 Item 4 — Layout: flow chart + wallet tiles
Replaces the "Budget coverage" bar list, which over-emphasised the wallets relative to the chart.
- **Two-column content grid:** flow chart card on the **left** (~2/3), a **right rail** (~1/3) with a
  grid of compact **wallet tiles** (2 across), and directly beneath the tiles a **full-width button
  spanning the rail** — `Apply auto-distribution`.
- **Delete the "Budget coverage" card** entirely. The tiles carry that information.
- **Tile** (compact, minimal — this is a *tile*, not a content card, so DESIGN-SPEC §8 Rule 1's
  hero-number + MetricBar requirement does **not** apply; record the exception in the spec):
  - wallet name (13px `text-ink`, truncating)
  - **% of budget funded**, 18px `font-medium tracking-tight` — the one prominent number
  - allocated amount, 11px `text-ink-muted`
  - nested-card styling: `rounded-[11px] border border-inner-border`, ~12px padding
  - colour: at/over 100% → `positive`; short → `ink`; nothing allocated → `ink-muted`. No bar.
  - **Must-fund wallets** (`fixed`, `accumulating`, `capped`) get the %. **Free-pool wallets**
    (Unallocated, investment) have no honest denominator → show the amount and a `free pool` label,
    **no %** (consistent with DESIGN-SPEC §8 Rule 1's exception: never a fabricated ratio).
- **Tiles are clickable** → open the **existing wallet edit modal** (the "Cap reduction settings" one)
  in place, so budget/cap edits happen without leaving the page. On save, the page recomputes (tiles,
  chart, summary strip). Render as real `<button>`s (keyboard + focus states).
- **Single-income case: delete the separate Configure view.** Tiles + `Apply auto-distribution` fully
  replace it. **Multi-income:** the Configure view (income include/exclude) and the distribution
  editor stay.
- `Apply auto-distribution` **overwrites existing manual allocations**, so it gets a confirm step
  before writing (see §12.8).

### 12.4 Item 3 — Flow chart redesign (single combined Sankey)
Current chart is one card per income, with heavy black slabs, flat grey ribbons, and colliding labels
(`sport` overlaps `supermarkt`). Target: **one chart, all included incomes, one colour per income.**
- **One card, one SVG.** Left column = one node per **included** income; right column = one node per
  destination wallet. A wallet fed by two incomes shows two stacked ribbons landing on its node.
- **Income colour** comes from the DESIGN-SPEC §2 wallet identity ramps (bar stops: blue `#378ADD`,
  green `#639922`, pink `#D4537E`, purple `#7F77DD`, amber `#EF9F27`), assigned deterministically by
  income sort order. **Do not invent hues** (DESIGN-SPEC §2).
- **Ribbons** take their **source income's** colour at low alpha (~0.22 light / ~0.30 dark), raised on
  hover. Cubic-bezier, width at each end proportional to the flow.
- **Nodes are thin:** ~8px wide, `rounded-[4px]` — not the current slabs. Income nodes use their
  colour; wallet nodes are neutral (`ink-soft` family) **except Unallocated, which keeps coral
  `accent`** (DESIGN-SPEC §2 already reserves coral for Unallocated amounts).
- **Minimum node/ribbon thickness** (~3px) so small flows stay visible without distorting proportions.
- **Label de-collision is a requirement, not a nicety:** compute label slots with a push-apart pass and
  draw a thin leader line when a label is displaced from its node. Wallet name 13px `ink`;
  amount + % 11px `ink-muted` beneath.
- **Bounded height** (e.g. 320–420px) rather than growing with the income amount.
- **All euro strings via `formatMoney()`** — including inside the SVG — so **privacy mode masks the
  chart too**. Check the masked string doesn't break label layout.
- **Inline SVG only** (DESIGN-SPEC §6 — a chart library import is a `design-check` violation).
- **Geometry lives in a pure `src/lib/` function** (e.g. `computeSankeyLayout({incomes, allocations,
  wallets, width, height}) → {nodes, links, labels}`) with unit tests: proportions sum correctly, min
  heights respected, no NaN on zero/empty flows, label de-collision deterministic. The component only
  renders what the function returns. Same rationale as `resolveDistribution.js` — this is the part
  that silently breaks.

### 12.5 Item 5 — Distribution editor (multi-income)
Currently euro-only plain inputs. Target: parity with the app's distribution UX.
- **Per-row €/% toggle**, mixed freely across rows — **reuse `src/lib/resolveDistribution.js`**
  (`resolveRowExact` / `resolveDistribution`). Do **not** reimplement the maths: it's already the
  tested canonical resolver, and the project's rule is to share the identical primitive rather than
  duplicate it. `%` is of that income's amount (the app-wide "% always of total input" rule).
  Segmented pill toggle per DESIGN-SPEC §4.
- **Per-row "fund to budget" checkbox:** clicking it fills that wallet's allocation from this income
  automatically. Semantics (confirm — §12.8): fills the wallet's **remaining shortfall** (its budget
  minus what other included incomes already allocate to it), falling back to the full budget when
  nothing else funds it, and **clamped to the income's unassigned remainder** so an income can never
  be over-allocated.
- **Per-wallet funding bar, aggregated across ALL included incomes:**
  `sum(allocations to wallet across all included incomes) / wallet.budget`. The **same** bar renders in
  every income's row for that wallet — so a wallet fully funded by one income reads 100% everywhere,
  and a wallet fed 40/60 by two incomes reads 100% in both. Use the `MetricBar` primitive (5–6px,
  `track` bg). Over-funding (>100%) gets a distinct state, not a silently clipped bar.
- Live recompute as values change; unassigned remainder per income still flows to Unallocated and is
  shown as a footer row on that income's card.
- **Persistence unchanged:** rules are written to `income_distribution_rules` **in place**, storing
  **mode + raw value** (Option A, PROJECT-CONTEXT §7) — never resolved euros. No client-side balance
  math. No schema change.

### 12.6 Item 6 — Microcopy discipline
The instructional paragraphs are excessive. **Delete** (non-exhaustive, from the screenshots):
- "How your recurring income fills your wallet budgets." (page subtitle)
- "Select which recurring incomes fund your wallet budgets."
- "Must-fund wallets are filled to their budget. Tap a wallet to change its budget or cap."
- "Set how much of each income goes to each wallet. Whatever you don't assign flows to Unallocated.
  Must-fund wallets show their budget target; the summary flags any that fall short."

**Rule (goes into DESIGN-SPEC + the `design-check` table):** no page subtitles; no instructional
paragraphs explaining what a screen is for. Labels, numbers and empty states carry the meaning. Where a
control is genuinely non-obvious, at most **one short helper line (≤10 words)** attached to that
control — not to the page. Empty states are the exception (they must explain the absence).

### 12.7 DESIGN-SPEC & design-check updates (both sessions)
Because four of these are system-level, each session updates the spec it touches:
- **B2-1:** DESIGN-SPEC §4 gains the `PageHeader` component entry; §7 table gains a page-header row and
  the "no page subtitles / no instructional paragraphs" row. Mirror both into
  `.claude/skills/design-check/SKILL.md`.
- **B2-2:** DESIGN-SPEC gains the **card-less centred empty state** pattern, the **compact metric tile**
  pattern (+ its explicit exception to §8 Rule 1), and the **flow-diagram colour rules** (income-coloured
  ribbons from the identity ramps, neutral wallet nodes, coral Unallocated). Mirror into `design-check`.

### 12.8 Decisions taken here (assumptions baked into the prompts — override if wrong)
1. ~~**`PageHeader` has no subtitle slot** — enforces §12.6 structurally.~~
   **OVERRIDDEN by owner, 2026-07-21 (during B2-1).** Rationale: the real problem is *explanatory
   prose*, not a second line — three pages put genuinely **factual data** under the title (Dashboard's
   month label, WalletDetail's `type · budget_type · €/mo`, IncomeRecurringDetail's `frequency · day N`),
   and deleting those loses real information. As built, `PageHeader` has a **`meta` slot restricted to
   short factual data**; the four instructional sentences were deleted outright. The enforced rule
   became *"no explanatory or instructional prose in a page header"* (DESIGN-SPEC §4 + §7, mirrored
   into `design-check`) rather than *"no second line"* — which is also the version an audit can
   actually check. §12.6's substance stands; only its structural mechanism changed.
2. **Tile click opens the existing wallet edit modal in place**, rather than navigating to the wallet page.
3. **`Apply auto-distribution` asks for confirmation** before overwriting existing manual allocations.
4. **The combined chart shows only incomes included in the plan** (the include/exclude selection stays
   in the multi-income Configure view). With one income it's always included.
5. **"Fund to budget" fills the remaining shortfall across included incomes**, clamped to the income's
   unassigned remainder — not blindly the full budget (which would double-fund a wallet already fed by
   another income).
6. **Free-pool wallets (Unallocated, investment) show no % on their tile** — no honest denominator.

### 12.9 Not in scope for B2
- Phase C analytics (planned-vs-used bars, the over/under nudge) — unchanged, still §6.
- Any schema change; any change to `distributeIncome.js` or balance-writing paths.
- Full multi-income editing UX beyond the editor improvements above (§8 deferrals stand).

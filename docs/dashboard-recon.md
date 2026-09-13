# Dashboard Rebuild — Recon

> Read-only inventory for the chat-side dashboard redesign session. No code or DB was
> changed. Ground truth: live Supabase (`duyttdjfvblhhjihybal`) + `src/pages/Dashboard.jsx`
> as of branch `b/workflow-sync-protocol`, 2026-07-16.
> Screenshots live in **`/screens`** (not `docs/`), test account `bram.duthoo+claudetest`.

---

## 1. Current dashboard inventory

`Dashboard.jsx` fetches six tables once on mount (all `select('*')`, no server-side
aggregation): `wallets` (active only, `is_active=true`), `income_recurring`,
`recurring_rules` (open-ended only, `end_date IS NULL`), `transactions`,
`income_distribution_rules`, `income_entries`. Everything below is computed **client-side**
in `src/lib/dashboardCalcs.js` from those arrays. Order top→bottom as rendered:

| # | Widget | Shows | Metric definition (formula) | Fed by | Uses `new Date()`? |
|---|---|---|---|---|---|
| — | **Header** | "Dashboard" + `format(now,'MMMM yyyy')` | current month label | `now` | yes (label only) |
| — | **UnallocatedConflictBanner** (conditional) | "N plans triggered at once" + Review modal | renders only if `fetchPendingConflict()` returns a `pending` row in `unallocated_pending_conflicts` for the user | `unallocated_pending_conflicts`, `unallocated_plans(+items)`, `wallets` | no (DB flag) |
| 1 | **Next 30 days** card | text row `cashNow + expectedIncome − upcomingCosts` then `ProjectedBalanceChart` | `calculateProjectedCash`: `cashNow=Σ wallet.balance`; `expectedIncome=Σ income_recurring occurrences in (today, today+30] × amount`; `upcomingCosts=Σ unpaid recurring_rules payments due in [today, today+30]` (a payment is "unpaid" if no matching `transaction` on that `recurring_rule_id`+date, or that tx `is_confirmed=false`) | wallets, income_recurring, recurring_rules, transactions | **YES** |
| 1b | **ProjectedBalanceChart** (inline SVG) | running-balance line over next 30d with income/cost event dots + labels; green fill above 0 / red below; dashed zero baseline | `getProjectedBalanceTimeline(…,30)`: starts at Σ balance, walks date-sorted income(+)/cost(−) events, tracks running/min/max; `onTrack = projectedEnd ≥ 0` | same as #1 | **YES** |
| 1.5 | **6-month outlook** | six mini-cards `MMM yyyy` + `projectedNet` (↑/↓ colored) | `calculateMonthOutlook(addMonths(now,i))` for i=0..5: `income=Σ income_recurring in month`, `costs=Σ recurring_rules in month`, `projectedNet=income−costs`. **Ignores actuals & balances** — pure recurring schedule. `outlookMax` computed but unused visually | income_recurring, recurring_rules | month arg derived from `now` |
| 2a | **Needs attention** (compact card, conditional `hasAlerts`) | grouped overdue rows (per rule: count + total), overspent rows, underfunded rows, "N alerts" pill | see #2b sources; overdue grouped by `rule.id` | — | — |
| 2b | **Needs attention** (verbose, always) | "All clear" OR 3 bordered blocks: overdue payments, overspent wallets, underfunded wallets | `getOverduePayments`: recurring_rules payments dated `< today` with no confirmed tx. `getOverspentWallets(now)`: **variable** wallets where month `debit` spend > `budget`. `getUnderfundedWallets`: **fixed** wallets where `upcomingNeeded(30d) > balance + expectedIncome-from-distribution-rules` | recurring_rules, transactions, wallets, income_distribution_rules, income_recurring | **overdue/underfunded YES**; overspent takes `now` as arg |
| 3a | **This month's performance** | 4 `MetricCard`s: Income, Spending, Net, Savings rate — each with value + ↑/↓ delta vs 3-mo avg | `calculateMonthMetrics(now)`: `income=Σ income_entries this month`; `spending=Σ transactions debit & is_confirmed this month`; `net=income−spending`; `savingsRate=net/income×100` (null if income 0). Avg = `calculateMonthlyAverage` over `subMonths(now,1..3)` | income_entries, transactions | month args from `now` |
| 3b | **Wallet progress** | per fixed+variable wallet: icon, name, spend bar vs budget, "€X spent of €Y budget", accumulating wallets also show Balance | `spent = Σ this-month confirmed debits on wallet`; `pct = spent/budget×100`; bar color ≥100 red / ≥75 amber / else green | wallets, transactions | `monthStart/End` from `now` |
| 4 | **Over time** | Monthly/Yearly toggle (only if ≥365d of data) + `IncomeSpendingChart` (grouped bars) + `CashTrendChart` (line) | monthly: last 12 months via `getHistoricalSeries`; yearly: last 5 via `getYearlySeries`. `totalCash` per point = `cashAsOf(periodEnd)` = current total minus net of confirmed tx dated after that point (back-reconstruction). `hasYearOfData` from earliest tx/income date | transactions, income_entries, wallets | `now`, `earliestDate` |
| — | **No-data state** | "Nothing here yet" | `wallets.length === 0` | — | — |

**`new Date()` gap (the deferred now-param, per `docs/testing-notes.md`).** Functions that call
`startOfDay(new Date())` **internally** (untestable deterministically today):
`calculateProjectedCash`, `getProjectedBalanceTimeline`, `getOverduePayments`,
`getUnderfundedWallets`. Functions that are **pure given their args** but are fed a
`now`-derived argument from the component (`const now = new Date()`, line 31):
`calculateMonthOutlook`, `getOverspentWallets`, `calculateMonthMetrics`,
`calculateMonthlyAverage`, `getHistoricalSeries`, `getYearlySeries`. A rebuild should thread a
single injected `now` through all of them (the deferred seam) so the whole dashboard is
deterministically testable.

**Redundancy already present:** "Needs attention" is rendered **twice** — a compact grouped
card (#2a, gated on `hasAlerts`) *and* a verbose always-on block (#2b). Both read the same
`overdue`/`overspent`/`underfunded` arrays. This is dead weight / a leftover.

---

## 2. Data availability map (live schema, no changes needed unless flagged)

Live wallet taxonomy (confirmed from DB, not docs): `wallets.type ∈
{fixed, variable, investment, unallocated}`; `wallets.budget_type ∈
{fixed-recurring, accumulating, capped, none, unallocated}`. **"Capped" is a `budget_type` on a
`variable` wallet** (e.g. test acct "Clothing" = variable/capped, cap in `budget`), *not* a
distinct `type`. Investment = type `investment`, budget_type `none`. Every table carries
`user_id` + RLS.

| Metric | Computable today? | How (tables/columns) |
|---|---|---|
| **a. Total balance across wallets** | ✅ trivial | `Σ wallets.balance` where `is_active`. Already computed (`cashNow`). |
| **b. "Freely spendable"** | ✅ but needs a definition decision | Candidate = `Σ balance` of `type='variable'` wallets **+** the `unallocated` wallet balance (`is_system=true` / `type='unallocated'`). Fixed & investment balances are earmarked, so exclude. All from `wallets.balance`+`type`. No schema change; just pick the rule. |
| **c. Income / spend / net, this month + prior month** | ✅ | Income = `Σ income_entries.amount` in month (`date`). Spend = `Σ transactions.amount` where `type='debit' AND is_confirmed` in month. Net = diff. Prior month = same with `subMonths(now,1)`. Exactly `calculateMonthMetrics`, already parameterised by month. |
| **d. Upcoming items next 14 days** | ✅ (14 = just change the window) | Costs from `recurring_rules` (`frequency ∈ monthly/quarterly/yearly` — CHECK-limited; `day_of_month`, `quarter_month`, `yearly_month`, `start_date`, `end_date`). Income from `income_recurring` (`frequency`, `day_of_month`, `start_date`, `end_date` — **no CHECK**, and `recurringUtils` also supports `daily/weekly/custom` even though the rules table CHECK forbids them). "Next occurrence" **is** derivable: `generateUpcomingDates(rule, today, n)` / `generatePaymentDates(rule, cutoff)` in `recurringUtils.js` already produce the dates. Current code uses a 30-day window; 14 is a one-line change. Pairing a recurring cost with its "already paid?" state uses the `transactions.recurring_rule_id`+`date`+`is_confirmed` join (see `findTransaction`). |
| **e. Capped-wallet fill % & over-cap** | ✅ | Fill = `balance / budget` for `budget_type='capped'` (cap stored in `budget`). Over-cap = `balance > budget`. Test acct: Clothing €120/€400 = 30%. Wallets page already renders "30% of cap". No schema change. |
| **f. Fixed-wallet "funded / paid this month"** | ⚠️ partial — two different concepts | (1) **Funded** = `balance / budget` for `fixed-recurring` (Wallets page shows "€500 of €1.200 funded"). (2) **Paid this month** relies on `transactions.is_confirmed`: a recurring payment is "confirmed/paid" when a matching tx row exists with `is_confirmed=true`; unpaid/overdue = missing or `is_confirmed=false` (that's exactly what `getOverduePayments`/`unpaidUpcomingCosts` test). So a "paid this month" badge is computable by joining `recurring_rules`→`transactions` on rule+date. There is **no explicit `due`/`paid` status column** — it's inferred from tx existence + `is_confirmed`. Workable, but it's a client-side per-rule date-generation loop (moderate cost). |
| **g. Plan stalls / pending conflicts** | ✅ | `unallocated_pending_conflicts` with `status='pending'` (+ `eligible_plan_ids`, `balance_snapshot`). Already surfaced by `UnallocatedConflictBanner`. `unallocated_plans.is_active` gives active-plan count. |

**Flags:**
- Nothing above **requires** a schema change. Every candidate metric is computable from
  current tables.
- **Heavy client-side** items: (d) upcoming-items and (f) paid-this-month both re-run
  `recurringUtils` date generation across every rule on the client on each load. Fine at
  current scale (1–3 rules) but it's O(rules × occurrences) in JS, not SQL. If the dashboard
  grows, consider a DB RPC (would be a schema/function change → `db-migration` skill).
- **`budget_allocations`** table exists (time-boxed budgets, `valid_from`/`valid_until`) but is
  **empty (0 rows)** and unused by the dashboard — budgets currently come straight off
  `wallets.budget`. Redesign should not assume it.

---

## 3. Design system extract

### Color tokens (from `src/index.css` `@theme` + `.dark`, authority `DESIGN-SPEC.md §2`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `cream` (page bg) | `#F4F0E7` | `#14140F` | page canvas; dark also = nested-card fill |
| `card` | `#FFFFFF` | `#1E1E17` | all cards/surfaces |
| `card-border` | `#E4DFD3` | `#2C2C2A` | 0.5–1px card hairlines |
| `inner-border` | `#ECE7DB` | `#2C2C2A` | dividers inside cards |
| `field` | `#F7F4EC` | `#14140F` | input bg; zebra `even:bg-field` |
| `track` | `#F1EFE8` | `#2C2C2A` | progress-bar / chart gridline tracks |
| `ink` | `#2C2C2A` | `#F1EFE8` | headings, numbers, primary-button bg (inverts) |
| `ink-soft` | `#5F5E5A` | `#B4B2A9` | secondary text |
| `ink-muted` | `#888780` | `#888780` | labels, captions |
| `ink-faint` | `#B4B2A9` | `#5F5E5A` | hints, axis text |
| `accent` (coral) | `#D85A30` | `#F0997B` | accent text/highlights, Unallocated amounts |
| `accent-solid` | `#D85A30` | `#D85A30` | fixed fills — logo mark, active checkbox |
| `positive` | `#3B6D11` | `#97C459` | positive text |
| `positive-bar` | `#639922` | `#639922` (fixed) | chart/bar positive fill |
| `positive-tint` | `#EAF3DE` | `rgba(99,153,34,0.18)` | positive chip bg |
| `negative` | `#993C1D` | `#F09595` | negative text |
| `negative-bar` | `#E24B4A` | `#E24B4A` (fixed) | chart/over-budget fill |
| `negative-tint` | `#FAECE7` | `rgba(226,75,74,0.15)` | negative chip bg |
| `warning` | `#EF9F27` | `#EF9F27` (fixed) | amber bar (75% budget) |

Dark is automatic: `.dark` overrides the same CSS vars, so `bg-cream`/`text-positive`/… adapt.
Rule of thumb for any unlisted color: on dark move **text/icons 2–3 stops lighter**, keep
**solid fills the same**, make **tinted bgs low-alpha** versions of the ramp.

**Wallet identity ramps** (chip bg pastel / icon+bar strong / bar): green
`#EAF3DE`/`#3B6D11`/`#639922`, blue `#E6F1FB`/`#185FA5`/`#378ADD`, pink
`#FBEAF0`/`#993556`/`#D4537E`, purple `#EEEDFE`/`#534AB7`/`#7F77DD`, amber
`#FAEEDA`/`#854F0B`/`#EF9F27`. Wallets are identified **by icon** (`<WalletIcon>`), not color.

### Card pattern
`bg-card border border-card-border rounded-[14px]` padding ~24px (`p-6`; dense cards
`p-5`/20px). Nested cards: `border-inner-border rounded-[11px]`. Dark separates by **fill**,
not border. Current dashboard uses `const cardClass = 'bg-card border border-card-border
rounded-[14px] p-6'`.

### Typography scale
- **Hero number:** 36px `font-medium tracking-tight` (decimals may be de-emphasized). Density
  pass uses **22px** (`text-[22px]`) for per-card hero values.
- **Card numbers:** 15–20px `font-medium`. (Dashboard `MetricCard` value = `text-xl`.)
- **Section labels:** 11–12px **uppercase `tracking-wider text-ink-muted`** (dashboard:
  `text-[11px] font-medium uppercase tracking-wider text-ink-muted`).
- **Body/rows:** 13–14px regular. **Numbers are NEVER bold/semibold** — only weights 400 & 500.
- Money **only** via `formatMoney()` / `formatMoneyCompact()` (`src/lib/format.js`) — inline
  `toFixed` on amounts is a design violation.

### Chart conventions (`DESIGN-SPEC.md §6`)
**Inline SVG only — chart library import is a violation.** Axis/gridlines `ink-faint`/`track`;
positive fill `#639922` (`fill-positive-bar`); negative `#E24B4A` (`fill-negative-bar`); dashed
zero baseline kept; line strokes `stroke-ink`. Existing charts:
`ProjectedBalanceChart` (460×200 viewBox), `IncomeSpendingChart` (720×240 grouped bars),
`CashTrendChart` (720×200 area+line) — all responsive via `width="100%"` + `viewBox`, tooltips
via `<title>`.

### Layout shell facts a dashboard must respect
- Shell = `Layout.jsx`: `flex h-screen overflow-hidden`; **fixed sidebar `aside w-56
  shrink-0`** (bg-card, right hairline); **`main flex-1 min-w-0 overflow-y-auto`** with inner
  `div px-7 py-6`. The `min-w-0` is load-bearing — it lets `main` shrink so wide content
  scrolls **inside** main instead of widening the whole shell.
- **Content has no explicit max-width** — it fills `main` minus `px-7`. Dashboard root is
  `<div className="space-y-6">`; grids use `sm:grid-cols-3 lg:grid-cols-6` (outlook) and
  `lg:grid-cols-2` (perf/progress).
- ⚠️ **The sidebar is NOT responsive** — no hamburger/collapse. At 390px it still eats 224px,
  leaving content in a ~150px strip (see `dashboard_light_390.png`). Any mobile-aware redesign
  must address this at the shell level, not just the dashboard.

---

## 4. Screenshots (in `/screens`, test acct, desktop 1440px unless noted)

| File | Page | Theme | Width |
|---|---|---|---|
| `dashboard_light_1440.png` | Dashboard | light | 1440 |
| `dashboard_dark_1440.png` | Dashboard | dark | 1440 |
| `dashboard_light_390.png` | Dashboard (mobile) | light | 390 |
| `wallets_light_1440.png` | Wallets | light | 1440 |
| `wallets_dark_1440.png` | Wallets | dark | 1440 |
| `walletdetail_unalloc_light_1440.png` | WalletDetail (Unallocated) | light | 1440 |
| `walletdetail_unalloc_dark_1440.png` | WalletDetail (Unallocated) | dark | 1440 |
| `income_light_1440.png` | Income | light | 1440 |
| `income_dark_1440.png` | Income | dark | 1440 |

**Data-density caveat.** The test account (`bram.duthoo+claudetest`) is **usable but thin**:
4 active wallets (fixed "Rent" €500/€1200, variable-capped "Clothing" €120/€400,
variable-accumulating "Groceries" €234, system "Unallocated" €300; total €1.154), 1 recurring
income (Salary €2.000/mo), 1 recurring cost (Monthly rent €1.200), 3 income_entries & 4
transactions (all July 2026). Consequences visible in the shots:
- **"Over time" section is sparse** — <1 month of history, so the Monthly/Yearly toggle is
  hidden (`hasYearOfData=false`) and the 12-month bar/line charts are mostly empty with one
  live column.
- **No "Needs attention" alerts fire** and **no conflict banner** (the account has no pending
  conflict; all conflicts in the DB belong to the owner and are resolved) — so those
  conditional widgets are **not** exercised in these shots.
- Projection chart, 6-month outlook, this-month performance, and wallet-progress **all render
  with real data** and are representative. I did **not** seed data.

---

## 5. Verdict

**What it does well**
- The **Next-30-days projection** is the strongest idea: a real running-balance line with
  labelled income/cost events and a red-below-zero fill answers "will I dip negative before
  payday?" — genuinely useful, and the one true hero.
- **Wallet progress bars** and **this-month performance with 3-mo-avg deltas** are honest,
  real-data, and on-system.
- Fully token-driven; **dark mode is clean** across all pages; charts are all compliant inline
  SVG.

**Dead weight / problems**
- **"Needs attention" is rendered twice** (compact grouped card + verbose block) from the same
  arrays — pure redundancy; collapse to one.
- **Too many stacked full-width sections** with no hero hierarchy — the spec's "one hero number
  per screen" is violated; the dashboard is a vertical list of six co-equal blocks. There's no
  top-line "total balance / freely spendable" summary (Wallets page has a `SummaryStrip`; the
  Dashboard does **not**).
- **6-month outlook** shows only `projectedNet` from the recurring *schedule* (ignores actual
  balances/spend), and its legend implies income/cost bars that aren't drawn — misleading and
  low-value as-is.
- The **Next-30-days explainer paragraph** ("If today is the 5th…") is a band-aid for an
  unintuitive metric.
- **Sparse-data cliff:** with <1yr history the "Over time" charts look broken/empty; needs a
  real empty/low-data state.

**Constraints a redesign must respect (incl. ones you didn't ask about)**
1. **Balances are never computed client-side for writes** — display aggregation (Σ balance) is
   fine, but any *movement* stays in RPCs. Recon-only metrics are safe.
2. **Money only through `formatMoney()`**; numbers `font-medium`, never bold; section labels
   11–12px uppercase; cards `rounded-[14px]`; **charts inline-SVG only**. Non-negotiable.
3. **Ship both themes together**; dark is fill-separated with lighter text stops.
4. **The `now`-injection seam is still open** — the rebuild is the agreed place to thread a
   single injected `now` through the six projection/series functions so the dashboard is
   deterministically testable (deferred in `docs/testing-notes.md`).
5. **Reuse the density-pass primitives** in `src/components/ui/` (`SummaryStrip`/`StatCell`,
   `CompactRow`, `MetricBar`, `CardFooterMeta`, `GhostAddCard`) — a dashboard SummaryStrip
   should reuse `SummaryStrip`, not reinvent it.
6. **Shell/mobile:** the sidebar doesn't collapse; a responsive dashboard needs a shell-level
   fix or it's dead below ~700px. `main` keeps `min-w-0 overflow-y-auto`; don't break that.
7. **Don't assume `budget_allocations`** (empty/unused) or that "capped" is a wallet `type`
   (it's a `budget_type`). Live taxonomy is the ground truth, per DB read above.

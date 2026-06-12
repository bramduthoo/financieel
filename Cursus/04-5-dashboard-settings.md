### 4.1.5  The dashboard

The dashboard is the application's overview page. It draws from every other part of the system: wallet balances, recurring payment rules, income schedules, distribution rules, and transaction history all flow into it. Most of the computation has been extracted into `lib/dashboardCalcs.js`, already documented in section 4.1.1.4. `Dashboard.jsx` itself is a presentation layer: it loads raw data in one fetch, passes it to the calculation functions from that library, and renders the results across four distinct visual sections. The two SVG chart components it renders, `IncomeSpendingChart` and `CashTrendChart`, are covered in sections 4.1.5.2 and 4.1.5.3 respectively.

---

#### 4.1.5.1  pages/Dashboard.jsx

`Dashboard.jsx` is the root page of the authenticated application. It sends six queries in parallel, stores the raw results in state, then runs a sequence of `dashboardCalcs` functions synchronously in the component body before returning any JSX. Because all data transformations happen after the loading guard, the rendered output always reflects a consistent snapshot of the loaded state without needing `useMemo` for the computed values.

**Loading six tables in parallel.**
`fetchAll` is defined inline inside the `useEffect` callback and fires once on mount. The six parallel queries bring in every table the dashboard needs: active wallets, income recurring rules, payment recurring rules (active only), all transactions, income distribution rules, and income entries. The transactions and income entries are fetched without date filters because the dashboard's historical charts and month calculations require data from multiple past periods; any date-scoping happens inside the `dashboardCalcs` functions rather than at the query level.

```js
const [{ data: w }, { data: ir }, { data: rr }, { data: tx }, { data: dr }, { data: ie }] = await Promise.all([
  supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
  supabase.from('income_recurring').select('*'),
  supabase.from('recurring_rules').select('*').is('end_date', null),
  supabase.from('transactions').select('*'),
  supabase.from('income_distribution_rules').select('*'),
  supabase.from('income_entries').select('*'),
])
```

**Post-load computations.**
After the loading guard renders nothing until data arrives, the component body calls eight `dashboardCalcs` functions in sequence. Each call is a plain assignment; the results are local variables used directly in JSX below. The three-month average is built by mapping `subMonths` offsets over an array of integers, a concise form of `[subMonths(now, 1), subMonths(now, 2), subMonths(now, 3)]`.

```js
const cash        = calculateProjectedCash(wallets, incomeRecurring, recurringRules, transactions)
const months      = Array.from({ length: 6 }, (_, i) =>
  calculateMonthOutlook(addMonths(now, i), incomeRecurring, recurringRules))
const overdue     = getOverduePayments(recurringRules, transactions)
const overspent   = getOverspentWallets(wallets, transactions, now)
const underfunded = getUnderfundedWallets(wallets, recurringRules, transactions, distributionRules, incomeRecurring)
const metrics     = calculateMonthMetrics(now, transactions, incomeEntries)
const prevMonths  = [1, 2, 3].map(n => subMonths(now, n))
const averages    = calculateMonthlyAverage(prevMonths, transactions, incomeEntries)
```

**Projected cash position.**
The first card renders the result of `calculateProjectedCash` (section 4.1.1.4) as a formula line followed by a coloured badge. The badge switches between green and red based on the sign of `cash.projected`. The underlying formula is: total cash held right now across all wallets, plus income expected in the next 30 days from active recurring income rules, minus upcoming fixed payments not yet confirmed.

```js
<div className={`inline-block px-6 py-3 rounded-full text-2xl font-bold ${
  cash.projected >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
}`}>
  €{cash.projected.toFixed(2)}
</div>
```

**Six-month outlook strip.**
The strip below the projected cash card maps the `months` array (six `calculateMonthOutlook` results) into a responsive grid of small cards. Each card shows the calendar month and the projected net for that month: expected income minus expected costs, without consulting any actual transaction history. A `TrendingUp` or `TrendingDown` icon switches based on the sign of `projectedNet`, giving an at-a-glance reading of surplus or deficit months.

**Needs attention.**
The "needs attention" section tests `overdue.length`, `overspent.length`, and `underfunded.length` and renders one alert card per non-empty category. Each card has a left border: red for overdue payments and overspent wallets, orange for underfunded wallets. The `hasAlerts` boolean gates the "all clear" message: when no category has results, the section shows a green checkmark instead of any alert. Overdue items are capped at five visible rows to avoid an unwieldy list.

**This month's performance and the MetricCard sub-component.**
The performance section renders four metric values (income, spending, net, savings rate) using the `MetricCard` sub-component defined at the bottom of the same file. `MetricCard` receives the current-month value and the three-month average and computes the difference internally. The `lowerIsBetter` prop inverts the colour convention for the spending metric: a spending figure below the average is shown in green rather than red. The `unit` prop switches the difference label between a euro amount and percentage points for the savings rate.

```js
function MetricCard({ label, value, current, avg, lowerIsBetter = false, unit = 'eur' }) {
  const diff   = current - avg
  const better = lowerIsBetter ? diff <= 0 : diff >= 0
  const sign   = diff >= 0 ? '+' : '−'
  const amount = unit === 'pp' ? `${Math.abs(diff).toFixed(1)}pp` : `€${Math.abs(diff).toFixed(0)}`
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      <p className={`text-xs mt-1 ${better ? 'text-green-600' : 'text-red-500'}`}>{sign}{amount} vs avg</p>
    </div>
  )
}
```

**Wallet progress bars.**
The `progressWallets` array is computed inline in the component body by filtering the loaded wallets to fixed and variable types and computing the current month's confirmed debit total for each. The calculation compares transaction dates against `monthStart` and `monthEnd` using `date-fns` comparison functions rather than string comparisons, because the stored balance on each wallet reflects all-time history and not a monthly slice.

```js
const progressWallets = wallets
  .filter(w => w.type === 'fixed' || w.type === 'variable')
  .map(w => {
    const spent = transactions
      .filter(t => t.wallet_id === w.id && t.type === 'debit' && t.is_confirmed
        && !isBefore(new Date(t.date), monthStart) && !isAfter(new Date(t.date), monthEnd))
      .reduce((s, t) => s + Number(t.amount), 0)
    return { ...w, spent }
  })
```

The rendered bar for each wallet applies the same traffic-light colour logic as the spending bar in `WalletDetail.jsx` (section 4.1.3.2): green below 75%, orange between 75% and 100%, red at or above 100%. The bar width is clamped to `Math.min(pct, 100)` so an overspent wallet fills the bar completely rather than overflowing its container.

**Over-time trends.**
The final section assembles the `series` array passed to both chart components. The `viewMode` state toggles between `'monthly'` and `'yearly'`, but the toggle buttons are hidden unless the dataset contains at least a full year of recorded data. The `hasYearOfData` check computes the distance from today to the earliest date in the combined transactions and income entries; `effectiveViewMode` falls back to `'monthly'` when less than 365 days of data exists, regardless of the stored `viewMode`.

```js
const hasYearOfData     = earliestDate !== null && differenceInDays(now, earliestDate) >= 365
const effectiveViewMode = hasYearOfData ? viewMode : 'monthly'
if (effectiveViewMode === 'monthly') {
  const monthsBack = Array.from({ length: 12 }, (_, i) => subMonths(startOfMonth(now), 11 - i))
  series = getHistoricalSeries(monthsBack, transactions, incomeEntries, wallets)
    .map(d => ({ label: format(d.month, 'MMM'), income: d.income, spending: d.spending, totalCash: d.totalCash }))
} else {
  const yearsBack = Array.from({ length: 5 }, (_, i) => subYears(startOfYear(now), 4 - i))
  series = getYearlySeries(yearsBack, transactions, incomeEntries, wallets)
    .map(d => ({ label: format(d.year, 'yyyy'), income: d.income, spending: d.spending, totalCash: d.totalCash }))
}
```

The same `series` array, carrying `{ label, income, spending, totalCash }` per period, is passed to both `<IncomeSpendingChart data={series} />` and `<CashTrendChart data={series} />`. Both charts are stateless: they receive data and return SVG.

---

**Imports:** `supabase` from `../lib/supabase`, `calculateProjectedCash`, `calculateMonthOutlook`, `getOverduePayments`, `getOverspentWallets`, `getUnderfundedWallets`, `calculateMonthMetrics`, `calculateMonthlyAverage`, `getHistoricalSeries`, `getYearlySeries` from `../lib/dashboardCalcs`, `IncomeSpendingChart`, `CashTrendChart`

**Exports:** `Dashboard` (default)

**Used by:** App.jsx (routed to `/`)

---

#### 4.1.5.2  components/IncomeSpendingChart.jsx

`IncomeSpendingChart` renders a paired bar chart showing income (green) alongside spending (red) for each period in the `data` array. It is purely a rendering component: it receives data from `Dashboard.jsx`, draws SVG, and returns nothing to its parent. The pattern follows the same structure as `WalletTrendsChart` (section 4.1.3.11) and `SalaryBarChart` in `IncomeRecurringDetail.jsx` (section 4.1.4.2): fixed-size viewport with named margin constants, `niceMax` for clean Y-axis ticks, and small helper functions translating values to pixel coordinates.

**SVG constants and axis helpers.**
The viewport is 720 by 240 pixels. `niceMax` rounds any value up to the nearest power-of-10 multiple, producing clean axis ceiling values like €500 rather than €473. `fmtY` formats axis labels compactly, using the `€1k` shorthand for values of €1,000 or more. Both helpers are module-level functions, not part of any component, so they are computed once at module load time.

```js
const W = 720, H = 240
const MT = 15, MR = 15, MB = 30, ML = 60
const CW = W - ML - MR
const CH = H - MT - MB

function bH(val)     { return (val / maxVal) * CH }
function bY(val)     { return MT + CH - bH(val) }
function bX(i, side) {
  const gx = ML + i * slotW + (slotW - groupW) / 2
  return side === 0 ? gx : gx + barW + 3
}
```

**Bar geometry.**
Each period occupies one `slotW` slot across the horizontal axis. Within each slot, the two bars together fill 60% of the slot width (`groupW = slotW * 0.6`). The 3-pixel gap between income and spending bars is baked into `barW`. `bX` places the income bar (side 0) at the left edge of the group and the spending bar (side 1) at the left edge plus one bar width plus the gap.

**Rendering.**
The SVG renders four things: Y-axis gridlines with axis labels (mapped over `ticks`), income bars (only when `d.income > 0`), spending bars (only when `d.spending > 0`), and X-axis period labels. Each `<rect>` carries a `<title>` child for hover tooltips. A final baseline `<line>` draws the zero axis across the full chart width.

---

**Imports:** none (project files)

**Exports:** `IncomeSpendingChart` (default)

**Used by:** Dashboard.jsx

---

#### 4.1.5.3  components/CashTrendChart.jsx

`CashTrendChart` renders the total cash-over-time line chart. Unlike the bar charts, it uses a connected polyline path built from SVG `M` (move-to) and `L` (line-to) path commands, with a shaded fill beneath the line. It is the only chart in the project that accounts for negative values: `minVal` can be below zero when the combined wallet balance was negative at some past point.

**Supporting negative values.**
The Y-axis range is computed from `minVal = Math.min(0, ...values)` and `maxVal = niceMax(Math.max(...values, 0))`. `minVal` is always at most zero, so the zero line always appears within the chart area. The `py` function maps any value (including negative ones) to a pixel Y coordinate by measuring its position within `range`, the distance from `minVal` to `maxVal`.

```js
const values = data.map(d => d.totalCash)
const minVal = Math.min(0, ...values)
const maxVal = niceMax(Math.max(...values, 0))
const range  = maxVal - minVal || 1
function px(i)   { return ML + i * stepX }
function py(val) { return MT + CH - ((val - minVal) / range) * CH }
```

**SVG path construction.**
`linePath` is built by mapping each data point to a `M x y` command for the first point and `L x y` for all subsequent ones, then joining them into a single path string. `areaPath` extends `linePath` with two additional `L` commands that drop down to the baseline and close the shape with `Z`, creating the filled area beneath the line. Both paths are passed to `<path>` elements: the area fill uses low opacity indigo, the line uses solid indigo at 2-pixel stroke width.

```js
const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
const areaPath = points.length > 0
  ? `${linePath} L ${points[points.length - 1].x} ${MT + CH} L ${points[0].x} ${MT + CH} Z`
  : ''
```

**Rendering.**
The chart renders gridlines and Y-axis labels (one of which coincides with the zero baseline), then the area fill, then the line, then a dot at each data point. The most recent point's dot is drawn at radius 4 instead of 2.5, visually emphasising the current position. A `<title>` child on each dot provides a hover tooltip with the period label and exact cash figure.

---

**Imports:** none (project files)

**Exports:** `CashTrendChart` (default)

**Used by:** Dashboard.jsx

---

### 4.1.6  Settings

The Settings page manages four application configuration values: the currency display (read-only), the month start day, the theme preference, and the strict-distribution toggle. It also contains a Danger Zone with a "delete all data" workflow for resetting the application's financial history while preserving the wallet structure and rules. Each setting is rendered in a reusable `SettingCard` wrapper component defined in the same file, and the two toggle controls use a shared `Toggle` button component also defined there.

---

#### 4.1.6.1  pages/Settings.jsx

`Settings.jsx` loads the single row from the `settings` table (see section 3.9), renders the four configuration cards, and updates individual fields on user interaction without requiring a Save button. A "Saved" indicator briefly appears after each change. The delete-all-data workflow is the most structurally complex part of the file: it opens a two-step modal chain protected by email one-time password verification.

**State and two separate fetches.**
The page runs two `useEffect` fetches on mount: `fetchSettings` reads the settings row via `.single()`, and `fetchUserEmail` calls `supabase.auth.getUser()` to retrieve the logged-in user's email address. The email is needed later as the OTP target. The two fetches are independent and could be run in parallel; the current implementation runs them sequentially from separate function calls, which works correctly because the page's visible content depends only on `settings`, and `userEmail` is not needed until the user opens the delete modal.

**Optimistic update with debounced flash.**
`updateSetting` writes the new value to the database and immediately updates the local `settings` state with the spread-and-override pattern (section 2.3.3), so the UI reflects the change without waiting for a database round trip. A "Saved" indicator appears for two seconds after each write. The cleanup logic uses `useRef` to store the current timeout id: if the user makes another change before the two seconds expire, `clearTimeout` cancels the previous timer and `setTimeout` starts a fresh one.

```js
async function updateSetting(field, value) {
  if (!settings?.id) return
  await supabase.from('settings').update({ [field]: value }).eq('id', settings.id)
  setSettings(prev => ({ ...prev, [field]: value }))
  if (timerRef.current) clearTimeout(timerRef.current)
  setSaved(true)
  timerRef.current = setTimeout(() => setSaved(false), 2000)
}
```

`useRef` is being used here as an escape hatch from React's state model: unlike `useState`, updating a ref does not trigger a re-render. Storing the timeout id in a ref means the cleanup can run without causing the component to re-render unnecessarily.

**The SettingCard and Toggle sub-components.**
`SettingCard` is a layout wrapper that places a label and description on the left and its `children` on the right. Every setting row uses it. `Toggle` is a custom toggle-switch button whose visual state reflects the boolean `checked` prop via a Tailwind `translate-x` class on the inner circle. Both are defined at the top of the same file, outside the `Settings` function. The pattern is the same as `MetricCard` in `Dashboard.jsx`: a sub-component written in the same file because it is only used in that one context.

**The four setting cards.**
Currency is displayed as a read-only badge; the value is hardcoded to `EUR €` and the field is not interactive, as multi-currency support is not part of the current scope.

The month start day input clamps its value between 1 and 28 on every change. The upper limit is 28 rather than 31 because months shorter than 31 days would make a start day of 29, 30, or 31 invalid in some months.

The theme toggle persists the `'light'` or `'dark'` string to the `settings` table, but the application does not read this value at startup to apply CSS changes. As the `SettingCard` description notes: dark mode is saved but not yet applied visually. The database column stores the user's preference for future use when the feature is implemented.

The strict distribution toggle controls how `DistributionPopup` behaves for manual and template income (section 4.1.4.3). When off, unassigned income flows automatically to the Unallocated wallet; when on, the popup's Distribute button stays disabled until 100% is allocated.

**The delete-all-data flow: warning modal and OTP modal.**
The `deleteModal` state is a simple string state machine with three values: `null` (no modal), `'warning'` (first confirmation), and `'code'` (OTP entry). Clicking "Delete all data" sets it to `'warning'`. Clicking "Send confirmation code" in the warning modal calls `sendOtp`, which triggers Supabase's email OTP system and advances the state to `'code'`.

```js
async function sendOtp() {
  if (!userEmail) return
  setDeleteLoading(true)
  await supabase.auth.signInWithOtp({
    email: userEmail,
    options: { shouldCreateUser: false },
  })
  setDeleteLoading(false)
  setDeleteModal('code')
}
```

The `shouldCreateUser: false` option prevents Supabase from creating a new account if the email is not found. The OTP flow relies on Supabase's transactional email delivery being configured in the project's dashboard; if email sending is not configured or is rate-limited, the code modal will appear but no email will arrive, and the user will be unable to proceed. This external dependency is worth noting as a potential point of failure in development or staging environments.

**confirmDeletion: verifying the OTP and wiping the data.**
Once the user enters the six-digit code, `confirmDeletion` calls `supabase.auth.verifyOtp`. If verification fails, an error message is shown and nothing is deleted. If it succeeds, four sequential database operations run: deleting all transactions, all income entries, all budget allocations, and resetting all wallet balances to zero. The last operation uses `update` rather than `delete` to preserve the wallet rows themselves.

```js
const { error } = await supabase.auth.verifyOtp({ email: userEmail, token: otpCode.trim(), type: 'email' })
if (error) { setDeleteError('Invalid or expired code.'); setDeleteLoading(false); return }
await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('income_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('budget_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('wallets').update({ balance: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')
```

The `.neq('id', '00000000-0000-0000-0000-000000000000')` filter is a known workaround pattern in Supabase applications. When Row Level Security is enabled on a table, Supabase requires that every `DELETE` and `UPDATE` call include at least one filter clause; a bare `.delete()` is rejected even if the RLS policy permits it. Filtering on `id` not equal to the nil UUID (a string of all zeros that will never match a real auto-generated UUID) satisfies the filter requirement while effectively targeting every row in the table. The operations run one after another rather than in parallel because each deletion must complete before the next to avoid foreign key constraint violations between, for example, transactions and income entries.

After the data wipe, `deleteSuccess` is set to `true`, which renders a toast at the bottom of the screen, and `navigate('/')` fires after 1.5 seconds to return the user to the now-empty dashboard.

---

**Imports:** `supabase` from `../lib/supabase`

**Exports:** `Settings` (default)

**Used by:** App.jsx (routed to `/settings`)

### 4.1.3  The wallets feature

Wallets are the core organising unit of the application, as section 1.2 establishes. This group covers the pages and components that let users create, view, and manage them: the list page, the detail page, the modal for creating and editing, and every sub-component rendered inside the detail view. Because fixed and variable wallets behave entirely differently, the codebase reflects that split with dedicated sub-components for each type.

---

#### 4.1.3.1  pages/Wallets.jsx

`Wallets.jsx` is the wallet list page. It loads all wallets ordered by `sort_order`, partitions them into four groups (fixed, variable, investment, and system), and renders each group under its own heading using `WalletCard`. Two overlapping modals live in the same JSX tree: a create/edit modal that opens `WalletModal` and a delete confirmation dialog assembled inline. The page follows the standard skeleton from section 2.4.8: state at the top, a `useEffect` triggering the initial load, and JSX that renders whatever state currently holds.

**State and initial load.**
Five state variables govern the page: the wallet list, a loading flag, a boolean controlling the modal, the wallet being edited (or `null` for a fresh creation), and the wallet targeted for deletion. The `useEffect` with an empty dependency list (section 2.4.7) fires the initial `fetchWallets` call once when the page mounts.

```js
const [wallets,      setWallets]      = useState([])
const [modalOpen,    setModalOpen]    = useState(false)
const [editWallet,   setEditWallet]   = useState(null)
const [deleteTarget, setDeleteTarget] = useState(null)
```

**Grouping wallets by type.**
Rather than filtering inside JSX, a `groups` array is computed once from the current wallet list. Each element carries a `key`, a `label`, and a `list` of wallets matching that type. System wallets are separated from ordinary wallets so they cannot be accidentally included in the fixed or variable groups. The `groups.map` in the JSX skips any group whose `list` is empty, so no empty section headings appear.

```js
const groups = [
  { key: 'fixed',    label: 'Fixed wallets',    list: wallets.filter(w => w.type === 'fixed'    && !w.is_system) },
  { key: 'variable', label: 'Variable wallets', list: wallets.filter(w => w.type === 'variable' && !w.is_system) },
  { key: 'system',   label: 'System',           list: wallets.filter(w => w.is_system) },
]
```

**Creating and editing through a shared modal.**
`openCreate` clears `editWallet` to `null` before opening the modal. `openEdit` sets `editWallet` to the chosen wallet. Both then set `modalOpen` to `true`. The `WalletModal` component receives `editWallet` as its `wallet` prop; when that prop is `null`, the modal shows a "New wallet" title and inserts on save. When it is a wallet object, the modal pre-fills and updates on save.

```js
async function handleSave(values) {
  if (editWallet) {
    await supabase.from('wallets').update(values).eq('id', editWallet.id)
  } else {
    await supabase.from('wallets').insert(values)
  }
  setModalOpen(false)
  setEditWallet(null)
  fetchWallets()
}
```

**Delete with a system-wallet guard.**
`handleDelete` checks `wallet.is_system` before proceeding. The system wallet (the Unallocated wallet) must never be deleted; this guard is a safety net in case the UI guard (hiding the delete button on system wallets) is bypassed. A non-system wallet is deleted with a single Supabase call; the cascade on the `wallet_id` foreign key removes all its transactions automatically (see section 3.4.4).

```js
async function handleDelete(wallet) {
  if (wallet.is_system) return
  await supabase.from('wallets').delete().eq('id', wallet.id)
  setDeleteTarget(null)
  fetchWallets()
}
```

---

**Imports:** `supabase` from `../lib/supabase`, `WalletCard`, `WalletModal`

**Exports:** `Wallets` (default)

**Used by:** App.jsx (routed to `/wallets`)

---

#### 4.1.3.2  pages/WalletDetail.jsx

`WalletDetail.jsx` is the individual wallet page and the most complex file in the project. It reads the wallet's `id` from the URL using `useParams`, fetches the wallet record, its active recurring rules, and all its transactions simultaneously, then renders entirely different content based on `wallet.type`. Fixed wallets show a pending-payments checklist, an upcoming-payments overview, and a recurring-rules manager, all across an Overview and a History tab. Variable wallets show a transaction entry form, a transaction overview table, a full history view, and a spending trends chart across three tabs. Investment wallets show a placeholder. The Unallocated wallet shows a read-only credit transaction list. The file is the assembly hub for all wallet-type-specific components.

**Reading the URL and loading data.**
`useParams` from React Router reads the `:id` segment of the current URL. `fetchAll` uses `Promise.all` to send three Supabase queries in parallel (section 2.7.4), destructuring the results immediately. The recurring-rules query filters for `end_date is null` to exclude retired rules. The `useEffect` dependency is `[id]`, meaning the page reloads whenever the user navigates from one wallet detail to another without unmounting.

```js
const { id } = useParams()
const [{ data: w }, { data: r }, { data: t }] = await Promise.all([
  supabase.from('wallets').select('*').eq('id', id).single(),
  supabase.from('recurring_rules').select('*')
    .eq('wallet_id', id).is('end_date', null).order('created_at'),
  supabase.from('transactions').select('*').eq('wallet_id', id),
])
```

**The spending bar calculation.**
Before any JSX is reached, `WalletDetail` computes the current month's debit total and the corresponding percentage of budget for variable wallets. This computation runs on the already-loaded `transactions` array rather than making a separate query. The date comparison uses ISO strings directly (`t.date >= monthFrom`) which works because date strings in `yyyy-MM-dd` format sort lexicographically. `barColour` and `textColour` apply a traffic-light scheme: green below 75%, amber between 75% and 100%, red at or above 100%.

```js
const monthDebits = wallet.type === 'variable'
  ? transactions
      .filter(t => t.type === 'debit' && t.date >= monthFrom && t.date <= monthTo)
      .reduce((s, t) => s + Number(t.amount), 0)
  : 0
const pct       = budget > 0 ? (monthDebits / budget) * 100 : 0
const barColour = pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-green-500'
```

**The header.**
The header row is the same for all wallet types. It contains a back-navigation button, the wallet's colour dot and name, and on the right side: the compact spending bar (variable wallets only), the balance pill, and a Settings button (non-system wallets only). The balance pill switches between green and red depending on whether the balance is positive or negative.

```js
<div className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
  Number(wallet.balance) >= 0
    ? 'bg-green-50 text-green-700'
    : 'bg-red-50 text-red-600'
}`}>
  Balance: €{Number(wallet.balance).toFixed(2)}
</div>
```

**Fixed wallet content.**
The fixed wallet section uses two tabs: Overview and History. The Overview tab stacks three panels: `TransactionChecklist` (pending payments), `UpcomingPayments` (schedule view), and `RecurringRules` (the rule manager). Each is wrapped in its own white card border. `TransactionChecklist` receives an `onBalanceChanged` callback pointing to `fetchAll`, so confirming a payment re-fetches the wallet's current balance and updates the header pill.

```js
{tab === 'overview' && (
  <div className="space-y-6">
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <TransactionChecklist walletId={id} onBalanceChanged={fetchAll} />
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <UpcomingPayments rules={rules} transactions={transactions} />
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <RecurringRules walletId={id} onRulesChanged={fetchAll} />
    </div>
  </div>
)}
```

**Variable wallet content.**
The variable wallet section uses three tabs: Overview, History, and Trends. The Overview tab renders `VariableOverview`, which handles transaction entry and the this-week/this-month table. The History tab renders `VariableHistory`, which provides the full sortable, filterable, paginated transaction history. The Trends tab renders `WalletTrendsChart`. Both `VariableOverview` and `VariableHistory` manage their own data fetching; they receive `walletId` as their only data prop.

```js
{wallet.type === 'variable' && (
  <>
    {tab === 'overview' && (
      <VariableOverview walletId={id} onBalanceChanged={fetchAll} />
    )}
    {tab === 'history' && (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <VariableHistory walletId={id} />
      </div>
    )}
    {tab === 'trends' && <WalletTrendsChart walletId={id} wallet={wallet} />}
  </>
)}
```

**The callback pattern.**
`onBalanceChanged` and `onRulesChanged` are both set to `fetchAll`. When a sub-component changes data that affects the wallet's balance or rule list, it calls its callback using optional chaining (`onBalanceChanged?.()`, see section 2.3.6), which triggers a full re-fetch. The re-fetched wallet data flows back through state into the header, so the balance pill and spending bar reflect the latest values without requiring sub-components to manage that state themselves.

---

**Imports:** `supabase` from `../lib/supabase`, `RecurringRules`, `TransactionChecklist`, `UpcomingPayments`, `PaymentHistory`, `WalletModal`, `VariableOverview`, `VariableHistory`, `WalletTrendsChart`

**Exports:** `WalletDetail` (default)

**Used by:** App.jsx (routed to `/wallets/:id`)

---

#### 4.1.3.3  components/WalletCard.jsx

`WalletCard` renders the summary tile for one wallet on the Wallets list page. Clicking anywhere on the card navigates to the wallet's detail page. System wallets show a lock badge instead of edit and delete buttons.

**Click navigation and stopPropagation.**
The outer `div` carries an `onClick` that calls `navigate('/wallets/' + wallet.id)`. The edit and delete buttons each call `e.stopPropagation()` before their own handler, preventing the click event from bubbling up to the div and triggering navigation. This is the standard pattern for action buttons inside a larger clickable area.

```js
<button
  onClick={e => { e.stopPropagation(); onEdit(wallet) }}
  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
>
  <Pencil size={14} />
</button>
```

**System wallet handling.**
When `wallet.is_system` is true, the edit and delete buttons are replaced by a lock badge. The badge is purely informational: it signals that this wallet is managed by the system and cannot be modified.

**Conditional budget and balance display.**
The card shows a monthly budget figure for fixed and variable wallets but hides it for investment and unallocated wallets. The Unallocated wallet shows its balance instead, since it has no budget. The balance text colour switches between green and red based on sign, consistent with the balance pill in WalletDetail.

---

**Imports:** none (project files)

**Exports:** `WalletCard` (default)

**Used by:** Wallets.jsx

---

#### 4.1.3.4  components/WalletModal.jsx

`WalletModal` is the create/edit modal for wallets. The same component handles both paths: when the `wallet` prop is `null` the form is blank and will insert; when it is a wallet object the form is pre-filled and will update. The optional-chaining and null-coalescing pattern (section 2.3.6) initialises every state variable from the wallet prop where it exists, falling back to a sensible default otherwise.

**State initialisation from the wallet prop.**
Each field of the form is its own piece of state, pre-populated at declaration time rather than via a separate `useEffect`. The cap reduction rate is stored in the database as a fraction between 0 and 1, but displayed in the form as a percentage between 1 and 100. The initialisation converts it: `Math.round(Number(wallet.cap_reduction_rate) * 100)` turns `0.50` into `50` for the input.

```js
const [name,       setName]       = useState(wallet?.name        ?? '')
const [type,       setType]       = useState(wallet?.type        ?? 'fixed')
const [budgetType, setBudgetType] = useState(wallet?.budget_type ?? 'fixed-recurring')
const [capReductionRate, setCapReductionRate] = useState(
  wallet?.cap_reduction_rate ? String(Math.round(Number(wallet.cap_reduction_rate) * 100)) : '50'
)
```

**The BUDGET_TYPES map and the type-change effect.**
`BUDGET_TYPES` is a module-level object that maps each wallet type to the list of valid budget-type options. When the user changes the `type` selection, a `useEffect` runs to check whether the current `budgetType` is still valid for the new type. If not, it resets to the first available option. This prevents the form from being submitted with an illegal combination such as type `variable` and budget type `fixed-recurring`.

```js
useEffect(() => {
  const options = BUDGET_TYPES[type]
  if (!options.find(o => o.value === budgetType)) {
    setBudgetType(options[0].value)
  }
}, [type])
```

**Cap reduction settings.**
A section at the bottom of the form appears only when `type === 'variable'` and `budgetType === 'capped'`. It contains a toggle switch for `cap_reduction_enabled` and, when enabled, a percentage input for `cap_reduction_rate`. The toggle is implemented as a `<button>` whose visual state reflects the boolean via Tailwind classes, a common pattern for custom toggle switches in projects that do not use a UI component library.

**Payload construction.**
`handleSave` builds a single `payload` object and calls `onSave(payload)`. For capped wallets, it adds the cap reduction fields to the payload. The rate is converted from the user-facing percentage back to a fraction: `Number(capReductionRate) / 100`. If reduction is disabled, the rate is stored as `1.0` rather than `0`, so that if the user later re-enables reduction, the previous percentage is remembered in the input but the stored value reflects the disabled state correctly.

```js
const payload = { name: name.trim(), type, budget_type: budgetType,
                  budget: Number(budget) || 0, colour, sort_order: Number(sortOrder) || 0 }
if (type === 'variable' && budgetType === 'capped') {
  payload.cap_reduction_enabled = capReductionEnabled
  payload.cap_reduction_rate    = capReductionEnabled ? Number(capReductionRate) / 100 : 1.0
}
await onSave(payload)
```

---

**Imports:** none (project files)

**Exports:** `WalletModal` (default)

**Used by:** Wallets.jsx, WalletDetail.jsx

---

#### 4.1.3.5  components/RecurringRules.jsx

`RecurringRules` manages the list of recurring payment rules for a fixed wallet. It renders the list of active rules, provides a create/edit form inline, and handles both soft-deletes and the versioned-edit behaviour described in section 3.5.5. The form UI adapts its visible fields to the selected frequency, showing only the inputs relevant to the schedule type the user has chosen.

**The emptyForm constant and setField helper.**
`emptyForm` is a module-level constant holding blank defaults for every form field. `setField` is a one-line helper that updates one field of the form object using the spread-and-override pattern from section 2.3.3: `setForm(f => ({ ...f, [key]: val }))`. This pattern keeps every input's `onChange` handler short.

```js
const emptyForm = {
  name: '', description: '', amount: '',
  frequency: 'monthly', start_date: format(new Date(), 'yyyy-MM-dd'),
  day_of_month: '1', quarter_month: '1', yearly_month: '0',
  custom_dates: [], custom_cycle_years: 1,
}
function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }
```

**Frequency-specific UI.**
The form contains five conditional sections that appear only for their respective frequency. Each is controlled by `{form.frequency === '...' && (...)}`. The weekly section renders a weekday dropdown. The monthly section renders a day-of-month number input. The quarterly section renders a month-within-quarter dropdown and a day input. The yearly section renders a month dropdown and a day input. The custom section renders a full calendar-based date picker sub-component `CustomDatePicker`. This keeps the common fields always visible while showing only what is relevant.

**Payload construction.**
`handleSave` builds a payload with all frequency columns set to `null` first, then populates only the columns relevant to the selected frequency via a `switch` statement. Setting irrelevant columns to `null` explicitly on every save prevents stale values from a previous frequency from persisting in the database row.

```js
const payload = { wallet_id: walletId, name: ..., amount: ..., frequency: ...,
  day_of_month: null, quarter_month: null, yearly_month: null,
  custom_dates: null, custom_cycle_years: null, end_date: null, parent_rule_id: null }
switch (form.frequency) {
  case 'monthly':   payload.day_of_month  = Math.min(Math.max(Number(form.day_of_month), 1), 31); break
  case 'quarterly': payload.day_of_month  = ...; payload.quarter_month = ...; break
  case 'yearly':    payload.day_of_month  = ...; payload.yearly_month  = ...; break
  case 'custom':    payload.custom_dates  = form.custom_dates; break
}
```

**Versioned edit when the amount changes.**
When editing an existing rule, the component compares the submitted amount to the stored amount. If they differ, it performs an archive-and-replace: it sets `end_date` on the old row to today (retiring it) and inserts a new row with `parent_rule_id` pointing at the retired one. If only non-amount fields changed, a simple `update` is performed instead.

```js
if (editingId) {
  const original      = rules.find(r => r.id === editingId)
  const amountChanged = original && Number(original.amount) !== payload.amount
  if (amountChanged) {
    await supabase.from('recurring_rules')
      .update({ end_date: format(new Date(), 'yyyy-MM-dd') }).eq('id', editingId)
    await supabase.from('recurring_rules')
      .insert({ ...payload, parent_rule_id: editingId })
  } else {
    await supabase.from('recurring_rules').update(payload).eq('id', editingId)
  }
}
```

**Soft-delete.**
`handleDelete` sets `end_date` to today on the target rule rather than deleting the row. This is the soft-deletion convention introduced in section 3.2. Past transactions that reference the rule's id remain valid; the rule simply no longer appears in any active-rules query.

```js
async function handleDelete(id) {
  await supabase.from('recurring_rules')
    .update({ end_date: format(new Date(), 'yyyy-MM-dd') }).eq('id', id)
  fetchRules()
}
```

---

**Imports:** `supabase` from `../lib/supabase`, `formatFrequency` from `../lib/recurringUtils`

**Exports:** `RecurringRules` (default)

**Used by:** WalletDetail.jsx

---

#### 4.1.3.6  components/TransactionChecklist.jsx

`TransactionChecklist` renders the pending-payments checklist for a fixed wallet. It computes which scheduled payments have not yet been confirmed and presents each as a clickable item. Clicking opens a confirmation modal with an optional remark field. Confirming inserts a transaction row (or updates an existing unconfirmed one) and calls `decrement_wallet_balance`. This is precisely the action traced through all layers of the application in section 2.10.

**Loading rules and transactions in parallel.**
Two queries run simultaneously via `Promise.all` (section 2.7.4): one for the wallet's active recurring rules and one for all its transactions. Both results land in state; `buildPendingItems` reads from that state each time the component renders.

```js
const [{ data: r }, { data: t }] = await Promise.all([
  supabase.from('recurring_rules').select('*')
    .eq('wallet_id', walletId).is('end_date', null),
  supabase.from('transactions').select('*').eq('wallet_id', walletId),
])
```

**Building the pending list.**
`buildPendingItems` calls `generatePaymentDates` (section 4.1.1.2) for each rule to produce every due date up to today. For each date it searches the loaded transactions for a matching `recurring_rule_id` and date string. If no confirmed transaction is found, the date is pending. The `existingId` field in the result carries the existing transaction's id if an unconfirmed row already exists, or `null` for dates that have no row at all.

```js
function buildPendingItems() {
  const today   = startOfDay(new Date())
  const pending = []
  for (const rule of rules) {
    const dueDates = generatePaymentDates(rule, today)
    for (const date of dueDates) {
      const dateStr  = format(date, 'yyyy-MM-dd')
      ...
      if (!existing || !existing.is_confirmed)
        pending.push({ rule, date, dateStr, existingId: existing?.id ?? null })
    }
  }
  return pending.sort((a, b) => a.date - b.date)
}
```

**Confirming a payment.**
`handleConfirm` branches on whether an existing (unconfirmed) transaction row exists. If it does, the existing row is updated with `is_confirmed: true` and the optional remark. If it does not, a new row is inserted. In either case, `decrement_wallet_balance` is called immediately after to adjust the wallet's stored balance. The `onBalanceChanged` callback is called last via optional chaining, triggering `fetchAll` in `WalletDetail` to update the balance pill in the header.

```js
await supabase.from('transactions').insert({
  wallet_id:         walletId,
  recurring_rule_id: confirmItem.rule.id,
  amount:            confirmItem.rule.amount,
  type:              'debit', date: confirmItem.dateStr,
  ...
  is_confirmed: true, completed_at: now,
})
await supabase.rpc('decrement_wallet_balance', {
  p_wallet_id: walletId, p_amount: confirmItem.rule.amount,
})
onBalanceChanged?.()
```

---

**Imports:** `supabase` from `../lib/supabase`, `generatePaymentDates` from `../lib/recurringUtils`

**Exports:** `TransactionChecklist` (default)

**Used by:** WalletDetail.jsx

---

#### 4.1.3.7  components/UpcomingPayments.jsx

`UpcomingPayments` presents scheduled future payments in either a table view or a calendar view. It receives the already-loaded `rules` and `transactions` arrays as props from `WalletDetail`, so it makes no database calls of its own. The table view shows payments within a user-selected timeframe (this week or this month). The calendar view is a separate sub-component `CalendarView` with its own month-navigation state.

**Table view: generating upcoming events.**
For the table, the component calls `generateUpcomingDates` (section 4.1.1.2) for each rule starting from tomorrow and collects dates up to the selected horizon. As soon as a date exceeds the horizon, the inner loop breaks; the remaining future dates are discarded. The events are sorted by date for chronological display.

```js
const tableEvents = []
for (const rule of rules) {
  const upcoming = generateUpcomingDates(rule, addDays(today, 1), 60)
  for (const date of upcoming) {
    if (date > horizon) break
    tableEvents.push({ rule, date, dateStr: format(date, 'yyyy-MM-dd') })
  }
}
tableEvents.sort((a, b) => a.date - b.date)
```

**CalendarView: building the byDay map.**
`CalendarView` combines `generatePaymentDates` (for past and present dates in the viewed month) with `generateUpcomingDates` (for future dates) to find all payment events in the viewed month. The results are grouped into a `byDay` object keyed by day-of-month. Each event carries a `confirmed` flag (from crossing the transactions array) and an `isFuture` flag. Calendar cells with events are colour-coded: blue for future, green for confirmed, red for overdue.

```js
const tx        = transactions.find(
  t => t.recurring_rule_id === rule.id && t.date === dateStr
)
const confirmed = tx?.is_confirmed ?? false
const isFuture  = date > today
if (!byDay[d]) byDay[d] = []
byDay[d].push({ rule, date, dateStr, confirmed, isFuture })
```

**Calendar grid construction.**
The grid is a 7-column CSS grid. Empty cells are prepended to align the first day of the month with its correct weekday column. The offset uses the Sunday-to-Monday conversion `(new Date(year, month, 1).getDay() + 6) % 7` to ensure the grid always starts on Monday regardless of the JavaScript `Date` convention.

---

**Imports:** `generatePaymentDates`, `generateUpcomingDates` from `../lib/recurringUtils`

**Exports:** `UpcomingPayments` (default)

**Used by:** WalletDetail.jsx

---

#### 4.1.3.8  components/PaymentHistory.jsx

`PaymentHistory` renders the full confirmed-payment history for a fixed wallet in a sortable, filterable, paginated table. Clicking any row opens a detail modal; from the detail modal the user can open an edit form. If the user changes the amount on a historical payment, the component corrects the wallet balance by reversing the old effect and applying the new one.

**Relational join in the fetch.**
The Supabase query uses the dot-notation `select('*, recurring_rules(name, description)')` to fetch the rule's name and description alongside each transaction row. This is a Supabase convenience for PostgreSQL joins: it follows the `recurring_rule_id` foreign key and attaches the referenced row's named columns as a nested object. The result is available as `t.recurring_rules?.name` on each transaction in the component.

```js
const { data } = await supabase
  .from('transactions')
  .select('*, recurring_rules(name, description)')
  .eq('wallet_id', walletId)
  .eq('is_confirmed', true)
  .order('date', { ascending: false })
```

**Sort state and the sort pipeline.**
`sort` holds a `{ key, dir }` object. `toggleSort` either flips the direction if the same column is clicked again, or resets to descending order for a new column. The `sorted` array is produced by copying `filtered` with `[...filtered].sort(...)` rather than sorting in place; sorting mutates an array, and mutating React state directly is incorrect (section 2.4.6).

```js
function toggleSort(key) {
  setSort(s =>
    s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'desc' }
  )
}
```

**Balance correction on edit.**
When a user submits an edited amount, `submitEdit` does not write to the database directly. Instead it stores a `confirm` object containing the actual write logic as a callback. The confirmation modal calls `confirm.onConfirm()` when the user approves. Inside that callback, if the amount changed, two RPC calls reverse the old balance effect and apply the new one before the transaction row is updated.

```js
const amountChanged = Number(f.amount) !== Number(f.oldAmount)
if (amountChanged) {
  await supabase.rpc('increment_wallet_balance',
    { p_wallet_id: walletId, p_amount: Number(f.oldAmount) })
  await supabase.rpc('decrement_wallet_balance',
    { p_wallet_id: walletId, p_amount: Number(f.amount) })
}
```

---

**Imports:** `supabase` from `../lib/supabase`

**Exports:** `PaymentHistory` (default)

**Used by:** WalletDetail.jsx

---

#### 4.1.3.9  components/VariableTransactionForm.jsx

`VariableTransactionForm` is the form for logging and editing manual cost entries on a variable wallet. It doubles as a create form (when `editTarget` is `null`) and an edit form (when `editTarget` is a transaction object). Both paths go through a two-step flow: the user fills in the form, clicks the submit button, and a confirmation modal shows a summary before the database write proceeds.

**Pre-population via useEffect.**
When `editTarget` changes, a `useEffect` (section 2.4.7) fires to populate or reset the form fields. This means the same form instance can be reused for multiple edits without being unmounted: changing `editTarget` from one transaction to another triggers the effect and reloads the form. Using a `useEffect` rather than initialising state from the prop at declaration time is necessary precisely because the prop can change after the component has mounted.

```js
useEffect(() => {
  if (editTarget) {
    setName(editTarget.note ?? '')
    setAmount(String(editTarget.amount))
    setDate(editTarget.date)
  } else {
    setName(''); setAmount(''); setDate(todayStr())
  }
}, [editTarget])
```

**Two-step confirmation.**
`handleSubmit` validates the inputs and, if they pass, sets `confirm` to `true`, which renders the modal. The modal shows the transaction summary and calls `handleConfirm` when approved. This separation means validation errors are shown in the form without opening the modal, and the user sees exactly what will be written before it is committed.

**The create path and the edit path.**
For a new transaction, `handleConfirm` inserts a row and calls `decrement_wallet_balance` once. For an edit, it first reverses the old amount with `increment_wallet_balance`, then applies the new amount with `decrement_wallet_balance`, then updates the row. The reversal ensures the balance remains accurate even if the user changes the amount by a large margin.

```js
if (editTarget) {
  await supabase.rpc('increment_wallet_balance',
    { p_wallet_id: walletId, p_amount: Number(editTarget.amount) })
  await supabase.rpc('decrement_wallet_balance',
    { p_wallet_id: walletId, p_amount: amt })
  await supabase.from('transactions').update({ amount: amt, date, note: name.trim() })
    .eq('id', editTarget.id)
} else {
  await supabase.from('transactions').insert({ wallet_id: walletId, amount: amt,
    type: 'debit', date, note: name.trim(), is_confirmed: true, completed_at: new Date().toISOString() })
  await supabase.rpc('decrement_wallet_balance', { p_wallet_id: walletId, p_amount: amt })
}
```

---

**Imports:** `supabase` from `../lib/supabase`

**Exports:** `VariableTransactionForm` (default)

**Used by:** VariableOverview.jsx

---

#### 4.1.3.10  components/VariableTransactionList.jsx

`VariableTransactionList` renders the transactions for a variable wallet scoped to a specific calendar month, passed in as the `viewMonth` prop. It is designed to be controlled by a parent that manages which month is in view and when a re-fetch is needed. The `refreshKey` prop is an integer counter: when the parent increments it, `useEffect` re-runs and the list re-fetches without any other prop changing.

**Month-scoped fetch.**
The query uses `.gte('date', from).lte('date', to)` to constrain results to the `viewMonth` boundaries. Both `from` and `to` are formatted as `yyyy-MM-dd` strings. The response is ordered first by date descending, then by `created_at` descending, so same-day entries appear in insertion order within each day.

```js
useEffect(() => { fetchTransactions() }, [walletId, viewMonth, refreshKey])

const from = format(startOfMonth(viewMonth), 'yyyy-MM-dd')
const to   = format(endOfMonth(viewMonth),   'yyyy-MM-dd')
const { data } = await supabase.from('transactions').select('*')
  .eq('wallet_id', walletId).gte('date', from).lte('date', to)
  .order('date', { ascending: false }).order('created_at', { ascending: false })
```

**Reversing the balance on delete.**
`handleDelete` checks the transaction's `type` before choosing which balance function to call. A debit that is removed requires an increment (restoring the money). A credit that is removed requires a decrement (undoing the addition). This generalises the balance correction for both directions.

```js
if (deleteTarget.type === 'debit') {
  await supabase.rpc('increment_wallet_balance',
    { p_wallet_id: walletId, p_amount: Number(deleteTarget.amount) })
} else {
  await supabase.rpc('decrement_wallet_balance',
    { p_wallet_id: walletId, p_amount: Number(deleteTarget.amount) })
}
await supabase.from('transactions').delete().eq('id', deleteTarget.id)
onChanged?.()
```

---

**Imports:** `supabase` from `../lib/supabase`

**Exports:** `VariableTransactionList` (default)

**Used by:** not currently wired into the component tree (available for future use in month-navigation views)

---

#### 4.1.3.11  components/WalletTrendsChart.jsx

`WalletTrendsChart` renders a paired bar chart showing the last six months of spending (debits) and income credits for a variable wallet. The chart is drawn entirely with SVG primitives, consistent with the project's rule of using no external chart libraries. It uses `useMemo` to avoid recomputing the per-month totals on every render.

**Fetching six months of transactions.**
The query fetches only `amount`, `type`, and `date` columns for efficiency, from a computed start date six months ago. The result lands in state and is the sole input to the `useMemo`.

```js
const from = format(subMonths(startOfMonth(new Date()), 5), 'yyyy-MM-dd')
const { data } = await supabase.from('transactions').select('amount, type, date')
  .eq('wallet_id', walletId).gte('date', from).order('date', { ascending: true })
```

**Computing monthly totals with useMemo.**
`chartData` is wrapped in `useMemo` (section 2.4.5 covers hooks; `useMemo` caches a computed value and only recomputes when its dependencies change). It builds an array of six month objects, each with a `debit` total, a `credit` total, and a short month label. The `useMemo` dependency is `[transactions]`, so the computation reruns only when the data changes, not on every parent re-render.

```js
const chartData = useMemo(() => {
  const months = Array.from({ length: 6 }, (_, i) =>
    subMonths(startOfMonth(new Date()), 5 - i)
  )
  return months.map(m => {
    const mtxns  = transactions.filter(t => t.date >= from && t.date <= to)
    const debit  = mtxns.filter(t => t.type === 'debit') .reduce((s, t) => s + Number(t.amount), 0)
    const credit = mtxns.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0)
    return { month: format(m, 'MMM yy'), debit, credit }
  })
}, [transactions])
```

**SVG coordinate helpers.**
The chart uses a fixed `viewBox` of 560 by 210 pixels with named margin constants (`MT`, `MR`, `MB`, `ML`) for the top, right, bottom, and left margins. The drawing area is the rectangle inside those margins. Three helper functions translate data values to pixel coordinates: `bH` converts a value to a bar height, `bY` converts it to the top y-coordinate of the bar (SVG y increases downward, so taller bars have a smaller y), and `bX` positions the left edge of a bar given its group index and which of the two bars in the pair it is.

```js
function bH(val)     { return (val / maxVal) * CH }
function bY(val)     { return MT + CH - bH(val) }
function bX(i, side) {
  const gx = ML + i * slotW + (slotW - groupW) / 2
  return side === 0 ? gx : gx + barW + 3
}
```

**Rendering bars and gridlines.**
The SVG maps over `ticks` to draw horizontal gridlines and y-axis labels, then maps over `chartData` to draw the bar pairs and x-axis month labels. Each bar is a `<rect>` element; the red bar (`fill="#f87171"`) represents spending, the green bar (`fill="#4ade80"`) represents credits. A `<title>` child on each `<rect>` provides a tooltip on hover.

---

**Imports:** `supabase` from `../lib/supabase`

**Exports:** `WalletTrendsChart` (default)

**Used by:** WalletDetail.jsx

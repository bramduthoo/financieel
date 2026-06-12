### 4.1.4  The income feature

Income is the other side of the wallets system. As section 1.2 explains, money enters through one door (the Income page), is divided across wallets according to rules, and any remainder lands automatically in the Unallocated wallet. The distribution logic itself lives in `lib/distributeIncome.js`, already covered in section 4.1.1.3. The three files in this section are the user interface around that logic: the Income page where all three entry workflows live, the recurring income detail page where automated distributions are logged and amended, and the `DistributionPopup` modal that any distribution-requiring action opens.

---

#### 4.1.4.1  pages/Income.jsx

`Income.jsx` is the most state-heavy page in the application. It manages three distinct income entry workflows from a single tabbed modal: quick entry (a one-off amount with a source name), recurring (a schedule rule with a saved wallet distribution), and template (a saved name/amount pair that can be reused). A single `confirm` state object holds the pending write as a callback, so every destructive action in the page routes through the same confirmation modal. Below the modal system, the page renders the income history table and a two-column grid of recurring income cards and template cards.

**Loading data with six parallel queries.**
`fetchAll` fires once on mount via `useEffect` (section 2.4.7). It sends six queries simultaneously with `Promise.all` (section 2.7.4): income entries, all recurring rules, templates, active wallets, the strict-distribution setting, and the id of the Unallocated wallet. The settings query reads only the `strict_distribution` column via a `select('strict_distribution')` call, avoiding pulling unneeded data. The Unallocated wallet is fetched separately by filtering `is_system = true`.

```js
const [{ data: e }, { data: r }, { data: t }, { data: w }, { data: s }, { data: ua }] = await Promise.all([
  supabase.from('income_entries').select('*').order('date', { ascending: false }),
  supabase.from('income_recurring').select('*').order('start_date', { ascending: true }),
  supabase.from('income_templates').select('*').order('created_at', { ascending: true }),
  supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
  supabase.from('settings').select('strict_distribution').single(),
  supabase.from('wallets').select('id').eq('is_system', true).single(),
])
```

**The confirm-as-callback pattern.**
Every action that writes to the database goes through a two-step confirmation. Rather than having a global `handleConfirm` with a long if/else chain tracking which action is in progress, the page stores the entire write logic inside the `confirm` state object as an `onConfirm` function. When the user presses the confirm button, the modal calls `confirm.onConfirm()`. This means each submit function is self-contained: it packages its own logic into an object and hands it to the modal, which knows only how to display it and call it.

```js
setConfirm({
  title: 'Add income?',
  body: <span>Add <strong>{fmt(amount)}</strong> from <strong>{source}</strong>?</span>,
  confirmLabel: 'Add income',
  variant: 'primary',
  onConfirm: async () => {
    await supabase.from('income_entries').insert({ ... })
    setDistributionState({ mode: 'income', totalAmount: Number(amount), ... })
  },
})
```

**Quick entry: two post-confirmation paths.**
`submitQuick` validates the form and builds a `confirm` object. The `onConfirm` callback inside it branches: if this is an edit (`modal.editEntry` is truthy), it calls `update` on the existing row and closes everything. If this is a new entry, it inserts a row and then sets `distributionState` to mode `'income'`, which causes the `DistributionPopup` to appear so the user can split the new money across wallets. The edit path does not open the popup because the money was already distributed at the time of the original entry.

**Recurring income: versioned edits and mandatory distribution setup.**
`submitRecurring` handles both creating a new rule and editing an existing one. The amount-change check is performed before the confirmation: if the submitted amount differs from the stored amount, the confirmation title and body change to warn that the current version will be archived. Inside `onConfirm`, if an amount change was detected, the old row is retired with `end_date` and a new row is inserted with `parent_rule_id` pointing at it, exactly mirroring the versioning pattern used for fixed-wallet recurring rules (section 4.1.3.5). After creating a new rule, `distributionState` is set to mode `'recurringSetup'`, which opens the popup in its mandatory strict mode where the user must configure the distribution for every future occurrence.

```js
if (f.isEdit && amountChanged) {
  await supabase.from('income_recurring').update({ end_date: todayStr() }).eq('id', f.id)
  const { data: newRule } = await supabase.from('income_recurring')
    .insert({ ...payload, start_date: todayStr(), parent_rule_id: f.id }).select().single()
  if (newRule) setDistributionState({ mode: 'recurringSetup',
    ruleId: newRule.id, ruleName: payload.name, ruleAmount: Number(f.amount) })
}
```

**Template management and the log-template flow.**
Templates are simple rows in the `income_templates` table. Creating and editing them is straightforward: `submitTemplate` builds a payload and calls `insert` or `update`. The more interesting path is logging an occurrence: clicking a template card sets `logTemplate` state, which opens a small modal pre-filled with the template's amount but allowing the user to override it for that occurrence. Confirming inserts an `income_entries` row with `source_type: 'template'` and the template's `id` as a foreign key, then sets `distributionState` to mode `'income'` to trigger the distribution popup. Archiving a recurring rule is a single `update` setting `end_date`; templates are the only income object that can be truly hard-deleted.

**History filtering and sorting with useMemo.**
The history table applies a `useMemo` pipeline to the entries array before rendering. The pipeline copies the list to avoid mutating state, applies the `sourceType` filter, applies the search filter using `includes` on the lowercased source name, then sorts by the selected column. The `displayedEntries` slice applies the `histLimit` after filtering, so the row count shown in the "Show N" dropdown reflects the filtered total, not the raw total.

```js
const filteredEntries = useMemo(() => {
  let list = [...entries]
  if (histFilter.sourceType !== 'all')
    list = list.filter(e => e.source_type === histFilter.sourceType)
  if (histFilter.search)
    list = list.filter(e => e.source?.toLowerCase().includes(histFilter.search.toLowerCase()))
  list.sort(...)
  return list
}, [entries, histFilter, histSort])
```

**The distributionState machine.**
`distributionState` is either `null` (no popup) or an object with a `mode` field. Mode `'income'` renders `DistributionPopup` with `strictMode` read from the settings and with an `onConfirm` that builds the final distributions array (adding any remainder to Unallocated in non-strict mode) and calls `distributeIncome` with `isAutomated: false`. Mode `'recurringSetup'` renders `DistributionPopup` with `strictMode={true}` and `onClose={null}` (which hides the close button, making distribution setup mandatory), and an `onConfirm` that inserts rows into `income_distribution_rules` rather than executing an immediate distribution.

```js
onConfirm={async (distributions) => {
  const finalDists = [...distributions]
  if (!strictMode) {
    const rem = Number((distributionState.totalAmount - assigned).toFixed(2))
    if (rem > 0.005 && unallocatedWalletId)
      finalDists.push({ wallet_id: unallocatedWalletId, amount: rem })
  }
  await distributeIncome({ distributions: finalDists, wallets: allWallets,
    unallocatedWalletId, sourceName: distributionState.sourceName,
    date: distributionState.date, isAutomated: false })
  setDistributionState(null)
}}
```

---

**Imports:** `supabase` from `../lib/supabase`, `generateUpcomingDates` from `../lib/recurringUtils`, `distributeIncome` from `../lib/distributeIncome`, `DistributionPopup`, `IncomeConfirmModal`

**Exports:** `Income` (default)

**Used by:** App.jsx (routed to `/income`)

---

#### 4.1.4.2  pages/IncomeRecurringDetail.jsx

`IncomeRecurringDetail.jsx` is the detail page for a single recurring income rule, reached by clicking a recurring income card on the Income page. The URL contains the rule's id (section 2.7.4 on `useParams`), which the page reads to fetch the specific rule, all rules (needed to reconstruct the amendment chain), the rule's distribution setup, and the wallet list. From this page the user can log a new income occurrence (which runs automated distribution if rules are configured), edit the rule's name, frequency, or amount, and view or reconfigure the wallet distribution.

**Fetching five parallel queries.**
`fetchData` depends on `[id]` in its `useEffect`, so it re-runs whenever the URL changes. Five queries run in parallel: the specific rule by id, all income recurring rows (for the chain), the distribution rules for this rule ordered by priority, all active wallets, and the Unallocated wallet's id. The distribution rules are queried with `.eq('income_recurring_id', id)` so the result is already scoped to this rule.

```js
const [{ data: r }, { data: all }, { data: dr }, { data: w }, { data: ua }] = await Promise.all([
  supabase.from('income_recurring').select('*').eq('id', id).single(),
  supabase.from('income_recurring').select('*').order('start_date', { ascending: true }),
  supabase.from('income_distribution_rules').select('*').eq('income_recurring_id', id).order('priority'),
  supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
  supabase.from('wallets').select('id').eq('is_system', true).single(),
])
```

**Reconstructing the amendment chain.**
`buildChain` is a module-level function that takes a rule id and the full list of all rules and follows `parent_rule_id` links backwards from the given rule to the earliest ancestor. It starts with the current rule, finds its parent in `allRules`, finds that rule's parent, and continues until a rule with no `parent_rule_id` is reached. Because the loop follows links backward (each newer rule points at its predecessor), the chain is built in reverse chronological order and then reversed at the end.

```js
function buildChain(ruleId, allRules) {
  const chain = []
  let current = allRules.find(r => r.id === ruleId)
  while (current) {
    chain.push(current)
    if (!current.parent_rule_id) break
    current = allRules.find(r => r.id === current.parent_rule_id)
  }
  return chain.reverse()
}
```

The `chain` is computed via `useMemo` (section 2.4.5) with `[rule, allRules]` as dependencies. This means it is only recomputed when the fetched data changes, not on every render triggered by modal state changes.

**The salary growth chart.**
`SalaryBarChart` is a sub-component defined within the same file. It receives the `chain` array and draws a bar for each rule version. The chart uses the same SVG coordinate pattern as `WalletTrendsChart` (section 4.1.3.11): constants for the viewport size and margins, and helper functions `bH`, `bY`, and `bX` that convert amounts to pixel heights and positions. Active rules (no `end_date`) are drawn in indigo; archived rules are drawn in a lighter shade.

```js
const maxAmt = Math.max(...chain.map(r => Number(r.amount)))
const barW   = Math.min(slotW * 0.55, 64)
function bH(val) { return (Number(val) / maxAmt) * CH }
function bY(val) { return MT + CH - bH(val) }
function bX(i)   { return ML + i * slotW + (slotW - barW) / 2 }
```

**Logging an income occurrence.**
`submitLog` validates the form and builds a `confirm` object (same pattern as `Income.jsx`). Inside `onConfirm`, it first inserts an `income_entries` row with `source_type: 'recurring'` and `income_recurring_id` linking back to the rule. Then, if `distributionRules` is non-empty, it calls `distributeIncome` with `isAutomated: true`, passing the saved distribution rules as the `distributions` array. The `isAutomated: true` flag activates the cap reduction logic in `distributeIncome` for any capped wallets (section 4.1.1.3). A three-second `distSuccess` flash confirms the distribution completed.

```js
if (distributionRules.length > 0) {
  await distributeIncome({
    distributions: distributionRules.map(dr => ({ wallet_id: dr.wallet_id, amount: Number(dr.amount) })),
    wallets: allWallets,
    unallocatedWalletId,
    sourceName: rule.name,
    date: logModal.date,
    isAutomated: true,
  })
}
```

**Editing a rule: archive-and-replace vs simple update.**
`submitEdit` follows the same versioning logic as `submitRecurring` in `Income.jsx` and `handleSave` in `RecurringRules.jsx` (section 4.1.3.5). If the amount changed, the current rule row receives an `end_date` and a new row is inserted referencing it via `parent_rule_id`. After an amount-change edit, the page navigates back to `/income` rather than reloading, because the current URL's id now points at an archived rule. A simple edit (name or frequency only) updates the row in place and calls `fetchData` to reload.

```js
if (amountChanged) {
  await supabase.from('income_recurring').update({ end_date: todayStr() }).eq('id', rule.id)
  await supabase.from('income_recurring').insert({ ...payload, start_date: todayStr(), parent_rule_id: rule.id })
  setConfirm(null); setEditModal(null)
  navigate('/income')
} else {
  await supabase.from('income_recurring').update({
    name: payload.name, frequency: payload.frequency, day_of_month: payload.day_of_month,
  }).eq('id', rule.id)
  setConfirm(null); setEditModal(null); fetchData()
}
```

**Editing the distribution setup.**
The distribution panel shows the current rules with wallet colour dots and amounts. Clicking Edit or "Set up distribution" opens `DistributionPopup` with `existingRules` pre-filled from the loaded distribution rules. When the popup confirms, `onConfirm` first deletes all existing `income_distribution_rules` rows for this recurring id, then inserts the new set. This delete-and-replace approach avoids updating individual rows and handles the case where the user removes a wallet from the distribution entirely.

```js
await supabase.from('income_distribution_rules').delete().eq('income_recurring_id', id)
if (distributions.length > 0) {
  await supabase.from('income_distribution_rules').insert(
    distributions.map((d, i) => ({ income_recurring_id: id,
      wallet_id: d.wallet_id, amount: d.amount, priority: i }))
  )
}
```

---

**Imports:** `supabase` from `../lib/supabase`, `distributeIncome` from `../lib/distributeIncome`, `DistributionPopup`, `IncomeConfirmModal`

**Exports:** `IncomeRecurringDetail` (default)

**Used by:** App.jsx (routed to `/income/recurring/:id`)

---

#### 4.1.4.3  components/DistributionPopup.jsx

`DistributionPopup` is the modal that appears whenever income needs to be split across wallets. It is used in three contexts: distributing a newly logged manual or template income entry (possibly non-strict, where the remainder routes to Unallocated automatically), and configuring the saved distribution rules for a recurring income source (always strict, where the Distribute button stays disabled until 100% is assigned). The `strictMode` prop and the `onClose` prop together determine which mode the popup operates in.

**Loading wallets and seeding amounts from existing rules.**
`fetchWallets` runs once on mount via `useEffect`. It fetches all active, non-system wallets ordered by `sort_order`. System wallets are excluded with `.eq('is_system', false)` because the Unallocated wallet is handled implicitly by the caller, not shown as a manual target. After loading the wallet list, the function seeds the `amounts` state object from the `existingRules` prop, which carries wallet-to-amount pairs from a previously saved distribution. This pre-filling is how the "Edit" distribution button on `IncomeRecurringDetail` opens the popup with the current values already entered.

```js
async function fetchWallets() {
  const { data } = await supabase.from('wallets').select('*')
    .eq('is_active', true).eq('is_system', false).order('sort_order')
  const ws = data ?? []
  setWallets(ws)
  const init = {}
  for (const rule of existingRules) {
    if (Number(rule.amount) > 0) init[rule.wallet_id] = String(rule.amount)
  }
  setAmounts(init)
}
```

**Derived display values.**
`assignedTotal`, `remainder`, `diff`, `canConfirm`, and `totalColour` are all computed directly from the current `amounts` state and the `totalAmount` prop on each render. They are not stored in state of their own because they are always fully derivable from state that already exists; storing them separately would risk them going out of sync (section 2.4.6). `canConfirm` is the critical gating value: in strict mode it is `false` unless `diff` is less than half a cent, allowing for floating-point arithmetic rounding.

```js
const assignedTotal = wallets.reduce((sum, w) => {
  const v = Number(amounts[w.id] || 0)
  return sum + (isNaN(v) ? 0 : v)
}, 0)
const diff        = Math.abs(assignedTotal - totalAmount)
const canConfirm  = strictMode ? diff < 0.005 : true
const totalColour = diff < 0.005 ? 'text-green-600' :
  assignedTotal > totalAmount ? 'text-red-600' : 'text-amber-600'
```

**The single-wallet shortcut.**
`handleWalletClick` implements the shortcut described in ARCHITECTURE.md: clicking the wallet's name (not the input) auto-fills the entire remaining amount into that wallet's input. The condition checks that the wallet's current input is empty (`amounts[wallet.id] || 0 === 0`) and that there is a meaningful remainder to fill (`remainder > 0.005`). Clicking a wallet name when it already has a value, or when the total is already fully assigned, has no effect.

```js
function handleWalletClick(wallet) {
  if (Number(amounts[wallet.id] || 0) === 0 && remainder > 0.005) {
    setAmounts(prev => ({ ...prev, [wallet.id]: remainder.toFixed(2) }))
  }
}
```

**Building the distributions array and calling the parent.**
`handleConfirm` collects only the wallets with a positive amount into a clean array of `{wallet_id, amount}` objects. It formats each amount with `Number(Number(amounts[w.id]).toFixed(2))` to prevent floating-point noise from entering the database. The array is passed to the `onConfirm` prop; the popup itself does not write to the database. Whether `onConfirm` calls `distributeIncome` or inserts `income_distribution_rules` rows is entirely the caller's concern, keeping the popup reusable across both use cases.

```js
function handleConfirm() {
  const distributions = wallets
    .filter(w => Number(amounts[w.id] || 0) > 0)
    .map(w => ({ wallet_id: w.id, amount: Number(Number(amounts[w.id]).toFixed(2)) }))
  onConfirm(distributions)
}
```

**Grouped wallet list and the null close handler.**
Wallets are grouped into `fixed`, `variable`, and `investment` using three `filter` calls, following the same pattern as `Wallets.jsx` (section 4.1.3.1). Empty groups are skipped in the render. The close button and the Cancel button are both conditionally rendered based on whether `onClose` is not null. Passing `onClose={null}` from `Income.jsx` when opening the recurring-setup popup removes both buttons, making it impossible to dismiss the popup without completing the distribution setup.

---

**Imports:** `supabase` from `../lib/supabase`

**Exports:** `DistributionPopup` (default)

**Used by:** Income.jsx, IncomeRecurringDetail.jsx

// Bank-statement import (pdf-import-plan.md, kbc-csv-import-background.md). Pick a source →
// parse → editable preview → confirm. NOTHING is auto-committed, and the files never leave the
// browser: parsing is 100% client-side and only confirmed transactions reach the database.
//
// TWO SOURCES, one downstream pipeline:
//   • Monthly export (CSV) — one file = a month of transactions with a running balance. Adds
//     recurring-link matching (so rows the app's own recurring flows post are not
//     double-counted) and month-boundary balance snapshots + soft reconciliation.
//   • Individual transaction (PDF) — one file = one transaction, unchanged.
//
// Commit paths, deliberately kept separate:
//   1. debits + refund credits → the transactional import_transactions RPC (all-or-nothing,
//      balance math inside the function — this page never touches a balance itself)
//   2. "log as income" credits → the EXISTING income flow (income_entries +
//      DistributionPopup + distributeIncome), reused as-is rather than reimplemented
//   3. recurring-linked rows → committed NOWHERE. Their money moves through the recurring
//      flows; this page only records the learned link.

import { useEffect, useRef, useState } from 'react'
import { FileUp, AlertTriangle, Check, Sparkles, Repeat } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { extractText } from '../lib/import/extractText'
import {
  buildRows, toCommitItems, toIncomeRows, isRecurringHandled, isIncomeRow, shouldInclude,
} from '../lib/import/buildRows'
import {
  buildCsvRows, toLinkUpserts, toRuleAmountUpdates, unansweredRecurring,
} from '../lib/import/buildCsvRows'
import { SUPPORTED_BANKS } from '../lib/import/detectBank'
import { distributeIncome } from '../lib/distributeIncome'
import { evaluateUnallocatedPlans } from '../lib/unallocatedPlans'
import { updateRecurringAmount, saveRecurringDistribution } from '../lib/recurringAmountUpdate'
import { formatMoney } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'
import PageHeader from '../components/ui/PageHeader'
import SummaryStrip from '../components/ui/SummaryStrip'
import DistributionPopup from '../components/DistributionPopup'
import IncomeConfirmModal from '../components/IncomeConfirmModal'

const fmt = n => formatMoney(n)

const SUPPORTED_LABEL = SUPPORTED_BANKS.map(b => b.label).join(', ')

// The import sources. `accept`/`matches` keep the picker, the drop handler and the empty state
// in agreement — a dropped file of the wrong kind is reported, never handed to the wrong parser.
const SOURCES = {
  csv: {
    label: 'Monthly export (CSV)',
    meta: 'KBC export CSV · one file per month',
    accept: 'text/csv,.csv',
    matches: file => file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv',
    wrongKind: 'Those files are not CSVs. Choose the “export” CSV you downloaded from KBC, or switch to the PDF source.',
    pickLabel: 'Choose a CSV',
    emptyCopy: 'Drop the KBC “export” CSV here — one file covers a whole month. It is read in your'
      + ' browser and never uploaded; nothing is saved until you confirm.',
  },
  pdf: {
    label: 'Individual transaction (PDF)',
    meta: `${SUPPORTED_LABEL} · Export KBC Mobile`,
    accept: 'application/pdf,.pdf',
    matches: file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    wrongKind: 'Those files are not PDFs. Import reads the PDF statements exported from your banking app.',
    pickLabel: 'Choose PDFs',
    emptyCopy: `Drop your ${SUPPORTED_LABEL} “Export KBC Mobile” PDFs here — one file per transaction.`
      + ' They are read in your browser and never uploaded; nothing is saved until you confirm.',
  },
}

const EMPTY_CSV_CONTEXT = { checks: [], snapshots: [], coverage: [] }

const selectClass =
  'w-full px-2 py-1.5 border border-card-border rounded-[8px] text-sm bg-field text-ink focus:outline-none focus:ring-2 focus:ring-accent/30'

// Segmented pill group, same primitive as the €/% toggles (DESIGN-SPEC §4).
function Segmented({ value, options, onChange }) {
  return (
    <div className="inline-flex bg-track rounded-[8px] p-0.5">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
            value === opt.value ? 'bg-ink text-cream' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function Import() {
  const fileInputRef = useRef(null)

  const [source, setSource] = useState('csv')

  const [wallets, setWallets] = useState([])
  const [mappings, setMappings] = useState([])
  const [dbFingerprints, setDbFingerprints] = useState([])
  const [preferredBank, setPreferredBank] = useState(null)
  const [strictMode, setStrictMode] = useState(true)
  const [unallocatedWalletId, setUnallocatedWalletId] = useState(null)
  const [loading, setLoading] = useState(true)

  // Recurring context for the CSV path. ALL rules are fetched, archived ones included: a saved
  // link can point at an archived version, and following parent_rule_id to the current one is
  // what keeps the link alive across a rule's re-pricing.
  const [incomeRules, setIncomeRules] = useState([])
  const [expenseRules, setExpenseRules] = useState([])
  const [links, setLinks] = useState([])
  const [storedSnapshots, setStoredSnapshots] = useState([])

  const [csvContext, setCsvContext] = useState(EMPTY_CSV_CONTEXT)

  const [rows, setRows] = useState([])
  const [errors, setErrors] = useState([])
  const [warnings, setWarnings] = useState([])
  const [progress, setProgress] = useState(null)   // { done, total } while reading files
  const [dragging, setDragging] = useState(false)
  const [loadWarning, setLoadWarning] = useState(null)
  const [pickWarning, setPickWarning] = useState(null)

  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState(null)
  const [result, setResult] = useState(null)       // { debits, credits, income }
  const [confirm, setConfirm] = useState(null)

  // "Log as income" hand-off: credits are processed one at a time through the existing
  // DistributionPopup, in place on this page so the rest of the batch isn't lost.
  const [incomeQueue, setIncomeQueue] = useState([])
  const [incomeState, setIncomeState] = useState(null)  // { row, incomeEntryId }
  const [incomeDone, setIncomeDone] = useState(0)

  // Confirmed-deviation rule updates, processed as their OWN queue before the income one. An
  // income rule's new version needs its distribution redone, which means a second (mandatory)
  // popup — kept strictly separate from the income popup above so the two never interleave.
  const [ruleState, setRuleState] = useState(null)   // { ruleId, name, amount, index }
  // The commit payloads are captured in a ref at confirm time: the rows they derive from are
  // removed from the preview as the commit proceeds, and the popup callbacks below run long
  // after that.
  const pending = useRef({ ruleUpdates: [], linkUpserts: [], snapshots: [], newRuleIds: {} })

  useEffect(() => { fetchContext() }, [])

  async function fetchContext() {
    const [wRes, mRes, tRes, sRes, uaRes, irRes, rrRes, lRes, snRes] = await Promise.all([
      supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('counterparty_wallet_mappings').select('counterparty_key, wallet_id'),
      supabase.from('transactions').select('import_fingerprint').not('import_fingerprint', 'is', null),
      supabase.from('settings').select('strict_distribution, bank_provider').single(),
      supabase.from('wallets').select('id').eq('is_system', true).single(),
      supabase.from('income_recurring').select('*'),
      supabase.from('recurring_rules').select('*'),
      supabase.from('recurring_import_links').select('*'),
      supabase.from('monthly_balance_snapshots').select('account_iban, boundary_date, balance'),
    ])
    setWallets(wRes.data ?? [])
    setMappings(mRes.data ?? [])
    setDbFingerprints((tRes.data ?? []).map(r => r.import_fingerprint))
    setStrictMode(sRes.data?.strict_distribution ?? true)
    setPreferredBank(sRes.data?.bank_provider ?? null)
    setUnallocatedWalletId(uaRes.data?.id ?? null)
    setIncomeRules(irRes.data ?? [])
    setExpenseRules(rrRes.data ?? [])
    setLinks(lRes.data ?? [])
    setStoredSnapshots(snRes.data ?? [])

    // A failed query here degrades the feature SILENTLY — no mappings means no suggestions,
    // no fingerprints means duplicate detection is off while still reporting "0 duplicates",
    // and no rules means a recurring row looks like an ordinary spend and gets double-counted.
    // That must be visible, not inferred from an empty table.
    const degraded = []
    if (mRes.error) degraded.push('wallet suggestions are unavailable')
    if (tRes.error) degraded.push('duplicate detection is off')
    if (wRes.error) degraded.push('wallets could not be loaded')
    if (irRes.error || rrRes.error) degraded.push('recurring rules could not be checked')
    if (lRes.error) degraded.push('saved recurring links are unavailable')
    if (snRes.error) degraded.push('balance snapshots are unavailable')
    setLoadWarning(degraded.length > 0
      ? `Import is running with reduced checks: ${degraded.join(', ')}. This usually means the import database migration has not been applied yet.`
      : null)

    setLoading(false)
  }

  // ─── Parsing ───────────────────────────────────────────────────────────────
  // Driven by the picker / drop handler, NOT an effect: under React 19 StrictMode an
  // effect runs twice in dev, which would parse every file twice and hit an already
  // detached ArrayBuffer on the second pass.

  async function handleFiles(fileList) {
    // A second drop while the first batch is still reading would race the progress updater
    // (and interleave two batches' dedupe), so ignore it rather than half-handle it. The same
    // applies mid-commit: the commit captured its payload already and clears settled rows at
    // the end, so a batch dropped in between would be silently swallowed.
    if (progress !== null || committing) return

    const kind = SOURCES[source]
    const dropped = Array.from(fileList ?? [])
    const files = dropped.filter(kind.matches)
    if (files.length === 0) {
      setPickWarning(dropped.length > 0 ? kind.wrongKind : null)
      return
    }
    const ignored = dropped.length - files.length
    setPickWarning(ignored > 0
      ? `${ignored} file${ignored === 1 ? '' : 's'} of another type ignored.`
      : null)

    setResult(null)
    setCommitError(null)
    setProgress({ done: 0, total: files.length })

    const extracted = []
    const readFailures = []
    for (const file of files) {
      try {
        // The CSV is plain text; only the PDF path needs pdf.js. Both stay in the browser.
        const text = source === 'csv' ? await file.text() : (await extractText(file)).text
        extracted.push({ fileName: file.name, text })
      } catch (err) {
        readFailures.push({ fileName: file.name, reason: err.message })
      }
      setProgress(p => (p ? { done: p.done + 1, total: p.total } : p))
    }

    const built = source === 'csv'
      ? buildCsvRows(extracted, {
        wallets,
        mappings,
        existingFingerprints: dbFingerprints,
        incomeRules,
        expenseRules,
        links,
        storedSnapshots,
      })
      : buildRows(extracted, {
        preferredBank,
        wallets,
        mappings,
        existingFingerprints: dbFingerprints,
      })

    // Files can be added to an existing preview, so a row duplicating one already on
    // screen is a BATCH duplicate, not a previously-imported one. Relabel those.
    const inPreview = new Set(rows.map(r => r.fingerprint))
    const newRows = built.rows.map(r =>
      r.duplicateOf === null && inPreview.has(r.fingerprint)
        ? { ...r, duplicateOf: 'batch', include: false }
        : r,
    )

    setRows(prev => [...prev, ...newRows])
    setErrors(prev => [...prev, ...readFailures, ...built.errors])
    setWarnings(prev => [...prev, ...built.warnings])
    if (source === 'csv') {
      setCsvContext(prev => ({
        checks: [...prev.checks, ...built.checks],
        snapshots: [...prev.snapshots, ...built.snapshots],
        coverage: [...prev.coverage, ...built.coverage],
      }))
    }
    setProgress(null)
  }

  // Switching source starts a new preview: the two sources produce different row shapes and
  // their own balance context, and silently merging a half-answered CSV batch into a PDF batch
  // would be worse than making the user re-drop the files.
  function switchSource(next) {
    if (next === source) return
    if (rows.length === 0) { setSource(next); resetPreview(); return }
    setConfirm({
      title: 'Switch import source?',
      body: <span>The {rows.length} row{rows.length === 1 ? '' : 's'} in this preview will be cleared. Nothing has been imported yet.</span>,
      confirmLabel: 'Switch',
      variant: 'primary',
      onConfirm: () => { setConfirm(null); setSource(next); resetPreview() },
    })
  }

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  /** Answers a row's recurring question. `patch` merges into the row's verdict. */
  function answerRecurring(id, patch) {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row
      const answered = { ...row, recurring: { ...row.recurring, ...patch } }
      // Rejecting the link hands the row back to the ordinary import; confirming it means the
      // recurring flow owns that money. `shouldInclude` is the same rule used when the rows were
      // built, so a rejected row that is ALSO an already-imported duplicate keeps its skip.
      return { ...answered, include: shouldInclude(answered) }
    }))
  }

  function resetPreview() {
    setRows([])
    setErrors([])
    setWarnings([])
    setCsvContext(EMPTY_CSV_CONTEXT)
    setResult(null)
    setCommitError(null)
    setPickWarning(null)
    setIncomeQueue([])
    setIncomeState(null)
    setIncomeDone(0)
    setRuleState(null)
    pending.current = { ruleUpdates: [], linkUpserts: [], snapshots: [], newRuleIds: {} }
  }

  // ─── Commit ────────────────────────────────────────────────────────────────

  const commitItems = toCommitItems(rows)
  const incomeRows = toIncomeRows(rows)
  const includedRows = rows.filter(r => r.include)
  const duplicateCount = rows.filter(r => r.duplicateOf).length
  const recurringRows = rows.filter(isRecurringHandled)
  // A recurring question left unanswered would leave a real transaction neither imported nor
  // accounted for, so it blocks the commit exactly like a missing wallet does.
  const unanswered = unansweredRecurring(rows)
  // Rows the user included but left without a wallet — they'd be silently dropped, so the
  // confirm button is blocked until each one is resolved.
  const unassigned = includedRows.filter(r => r.walletId === '' && r.creditMode !== 'income')
  const failedChecks = csvContext.checks.filter(c => !c.passed)

  // Computed from INCLUDED rows, not only the assigned ones: an unassigned row blocks the
  // Import button anyway, so by the time this can be committed the two sets are identical —
  // and showing € 0,00 next to "4 of 4" while wallets are still being picked reads as a bug.
  // "Log as income" rows are excluded: their wallets are decided in the distribution step.
  const netToWallets = includedRows.reduce(
    (sum, r) => r.creditMode === 'income'
      ? sum
      : sum + (r.direction === 'debit' ? -r.amount : r.amount),
    0,
  )

  // A snapshot-only run is allowed: re-importing a month whose rows are all duplicates still
  // has a balance worth recording, and confirmed recurring links are still worth saving.
  const hasSomethingToDo = commitItems.length > 0 || incomeRows.length > 0
    || csvContext.snapshots.length > 0 || toLinkUpserts(rows).length > 0

  const canConfirm = !committing && unassigned.length === 0 && unanswered.length === 0
    && hasSomethingToDo

  function askConfirm() {
    const linkCount = toLinkUpserts(rows).length
    setConfirm({
      title: 'Import these transactions?',
      body: (
        <span>
          Commit <strong>{commitItems.length}</strong> transaction{commitItems.length === 1 ? '' : 's'} to your wallets
          {incomeRows.length > 0 && <> and log <strong>{incomeRows.length}</strong> as income</>}.
          {duplicateCount > 0 && <> {duplicateCount} flagged duplicate{duplicateCount === 1 ? '' : 's'} {rows.filter(r => r.duplicateOf && r.include).length > 0 ? 'included as chosen' : 'skipped'}.</>}
          {recurringRows.length > 0 && <> {recurringRows.length} row{recurringRows.length === 1 ? '' : 's'} left to {recurringRows.length === 1 ? 'its' : 'their'} recurring rule{linkCount > 0 && <>, {linkCount} link{linkCount === 1 ? '' : 's'} remembered</>}.</>}
          {csvContext.snapshots.length > 0 && <> Month-end balances recorded.</>}
        </span>
      ),
      confirmLabel: 'Import',
      variant: 'primary',
      onConfirm: () => guarded(runCommit),
    })
  }

  // Nothing awaits runCommit (it is fired from a modal callback), so an unexpected throw would
  // become an unhandled rejection: `committing` would stay true and the page would sit on
  // "Importing…" with no error. Every entry point into the commit sequence goes through this.
  async function guarded(step) {
    try {
      await step()
    } catch (err) {
      setCommitError(prev => prev ?? `The import stopped unexpectedly: ${err?.message ?? 'unknown error'}.`)
      setRuleState(null)
      setIncomeState(null)
      setCommitting(false)
    }
  }

  async function runCommit() {
    setConfirm(null)
    setCommitting(true)
    setCommitError(null)

    // Captured before any row leaves the preview — the queues below run across popups.
    pending.current = {
      ruleUpdates: toRuleAmountUpdates(rows),
      linkUpserts: toLinkUpserts(rows),
      snapshots: csvContext.snapshots,
      newRuleIds: {},
      failedRuleIds: new Set(),
    }

    if (commitItems.length > 0) {
      // All balance changes happen inside the RPC, atomically. No client-side balance math.
      const { error } = await supabase.rpc('import_transactions', { p_items: commitItems })
      if (error) {
        setCommitError(error.message || 'Nothing was imported — the transaction was rolled back.')
        setCommitting(false)
        return
      }
    }

    const committedDebits = commitItems.filter(i => i.direction === 'debit').length
    const committedCredits = commitItems.filter(i => i.direction === 'credit').length

    // Drop the rows now committed; anything left is an income row awaiting distribution or a
    // recurring row cleared once its link is written.
    // The same predicate toCommitItems uses, so the rows dropped from the preview can never
    // drift from the rows actually sent to the RPC.
    const committedIds = new Set(commitItems.length > 0
      ? rows.filter(r => r.include && r.walletId && !isIncomeRow(r) && !isRecurringHandled(r)).map(r => r.id)
      : [])
    setRows(prev => prev.filter(r => !committedIds.has(r.id)))
    setResult({
      debits: committedDebits,
      credits: committedCredits,
      income: 0,
      pending: incomeRows.length,
      recurring: recurringRows.length,
      snapshots: pending.current.snapshots.length,
    })

    // Rule re-pricings first: a link must point at the version that survives, so the links are
    // written only once every rule update has produced its new version.
    await startNextRuleUpdate(0)
  }

  // ─── Confirmed deviations: re-price the rule, then redo its distribution ───

  async function startNextRuleUpdate(index) {
    const queue = pending.current.ruleUpdates
    if (index >= queue.length) {
      await persistLinksAndSnapshots()
      return
    }

    const update = queue[index]
    let result
    try {
      result = await updateRecurringAmount(update.rule, update.amount)
    } catch (err) {
      // The money is already committed and correct; only this rule change failed. Say so
      // precisely instead of implying the import broke — and carry on with the rest of the
      // queue, so one bad rule doesn't quietly abandon the others.
      pending.current.failedRuleIds.add(update.rule.id)
      setCommitError(prev => [
        prev,
        `Imported, but "${update.rule.name}" could not be updated to ${fmt(update.amount)}: `
        + `${err?.message ?? 'unknown error'}. Change the amount from its own page.`,
      ].filter(Boolean).join(' '))
      await startNextRuleUpdate(index + 1)
      return
    }

    pending.current.newRuleIds[update.rule.id] = result.newRule.id

    if (result.needsDistribution) {
      // A new recurring-income version starts with no distribution, and one is mandatory —
      // the same popup the Income page shows after an amount change.
      setRuleState({
        ruleId: result.newRule.id,
        name: update.rule.name,
        amount: update.amount,
        index,
      })
      return
    }

    await startNextRuleUpdate(index + 1)
  }

  async function persistLinksAndSnapshots() {
    setRuleState(null)
    const { snapshots, newRuleIds, failedRuleIds } = pending.current
    const notes = []

    // A link whose rule failed to re-price would teach the NEW amount while the rule keeps the
    // old one — next month the row would be recognised silently and the rule stay wrong. Skip it
    // and let it ask again.
    const linkUpserts = pending.current.linkUpserts.filter(l => !failedRuleIds.has(l.rule.id))

    if (linkUpserts.length > 0) {
      const userId = await getCurrentUserId()
      const now = new Date().toISOString()
      const payload = linkUpserts.map(link => {
        // Follow a rule that was just re-priced onto its new version, so the link never points
        // at the archived one.
        const ruleId = newRuleIds[link.rule.id] ?? link.rule.id
        return {
          rule_kind: link.rule.kind,
          income_recurring_id: link.rule.kind === 'income' ? ruleId : null,
          recurring_rule_id: link.rule.kind === 'expense' ? ruleId : null,
          counterparty_key: link.counterparty_key,
          direction: link.direction,
          linked_amount: link.linked_amount,
          account_iban: link.account_iban,
          last_seen_at: now,
          user_id: userId,
        }
      })
      const { error } = await supabase
        .from('recurring_import_links')
        .upsert(payload, { onConflict: 'user_id,counterparty_key,direction' })
      // A lost link costs one confirmation next month; it never affects money, so it must not
      // look like a failed import.
      if (error) notes.push('the recurring links could not be saved, so those rows will ask again next month')
    }

    if (snapshots.length > 0) {
      const userId = await getCurrentUserId()
      const now = new Date().toISOString()
      const { error } = await supabase.from('monthly_balance_snapshots').upsert(
        snapshots.map(s => ({
          account_iban: s.accountIban,
          boundary_date: s.boundaryDate,
          balance: s.balance,
          source: 'kbc_csv',
          updated_at: now,
          user_id: userId,
        })),
        { onConflict: 'user_id,account_iban,boundary_date' },
      )
      if (error) notes.push('the month-end balances could not be recorded')
    }

    if (notes.length > 0) {
      setCommitError(prev => prev
        ?? `The transactions were imported, but ${notes.join(' and ')}.`)
    }

    // Both are consumed now. Leaving the snapshots in place would keep the Import button live
    // with nothing left to import (and re-write the same boundaries on a second click).
    pending.current.snapshots = []
    pending.current.linkUpserts = []
    setCsvContext(prev => ({ ...prev, snapshots: [] }))

    // The recurring rows are settled now — clear them so the preview shows only what is left.
    setRows(prev => prev.filter(r => !isRecurringHandled(r)))

    if (incomeRows.length > 0) {
      setIncomeQueue(incomeRows)
      setIncomeDone(0)
      await startNextIncome(incomeRows, 0)
      return
    }

    setCommitting(false)
    await refreshAfterCommit()
  }

  // ─── "Log as income" hand-off (the existing income path, reused) ───────────

  async function startNextIncome(queue, index) {
    if (index >= queue.length) {
      setIncomeState(null)
      setIncomeQueue([])
      setCommitting(false)
      await refreshAfterCommit()
      return
    }
    const row = queue[index]
    const userId = await getCurrentUserId()
    const { data: entry, error } = await supabase.from('income_entries').insert({
      amount: row.amount,
      source: row.counterparty,
      date: row.date,
      note: row.note || null,
      source_type: 'manual',
      user_id: userId,
    }).select().single()

    if (error) {
      setCommitError(`Could not log "${row.counterparty}" as income: ${error.message}`)
      setIncomeState(null)
      setIncomeQueue([])
      setCommitting(false)
      return
    }
    setIncomeState({ row, incomeEntryId: entry?.id ?? null, index })
  }

  async function refreshAfterCommit() {
    // Learned mappings and fingerprints both changed — reload so a follow-up batch in the
    // same session sees them.
    await fetchContext()
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const busy = progress !== null

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
    >
      <PageHeader
        title="Import"
        meta={SOURCES[source].meta}
        actions={
          rows.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={resetPreview}
                className="px-3 py-2 rounded-[9px] border border-[#D3D1C7] dark:border-card-border text-sm text-ink-soft hover:bg-track transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-ink text-cream px-4 py-2 rounded-[9px] text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <FileUp size={15} />
                Add files
              </button>
            </div>
          )
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <span className="text-[11px] uppercase tracking-wider text-ink-muted">Source</span>
        <Segmented
          value={source}
          onChange={switchSource}
          options={Object.entries(SOURCES).map(([value, s]) => ({ value, label: s.label }))}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={SOURCES[source].accept}
        multiple
        className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
      />

      {loadWarning && (
        <div className="bg-[#FAEEDA] text-[#854F0B] dark:bg-[#854F0B]/20 dark:text-[#EF9F27] text-sm px-4 py-3 rounded-[8px] mb-6 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{loadWarning}</span>
        </div>
      )}

      {pickWarning && (
        <div className="bg-[#FAEEDA] text-[#854F0B] dark:bg-[#854F0B]/20 dark:text-[#EF9F27] text-sm px-4 py-3 rounded-[8px] mb-6 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{pickWarning}</span>
        </div>
      )}

      {commitError && (
        <div className="bg-negative-tint text-negative text-sm px-4 py-3 rounded-[8px] mb-6 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{commitError}</span>
        </div>
      )}

      {result && (
        <div className="bg-positive-tint text-positive text-sm px-4 py-3 rounded-[8px] mb-6 flex items-start gap-2">
          <Check size={15} className="mt-0.5 shrink-0" />
          <span>
            Imported {result.debits} debit{result.debits === 1 ? '' : 's'} and{' '}
            {result.credits} refund credit{result.credits === 1 ? '' : 's'}
            {result.pending > 0 && <> · {incomeDone} of {result.pending} logged as income</>}
            {result.recurring > 0 && <> · {result.recurring} left to {result.recurring === 1 ? 'its' : 'their'} recurring rule</>}
            {result.snapshots > 0 && <> · {result.snapshots} month-end balance{result.snapshots === 1 ? '' : 's'} recorded</>}.
          </span>
        </div>
      )}

      {loading ? (
        <p className="text-ink-faint text-sm">Loading…</p>
      ) : busy ? (
        <p className="text-ink-muted text-sm">Reading {progress.done} of {progress.total} file{progress.total === 1 ? '' : 's'}…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          dragging={dragging}
          onPick={() => fileInputRef.current?.click()}
          errors={errors}
          source={SOURCES[source]}
        />
      ) : (
        <>
          {failedChecks.length > 0 && (
            <div className="bg-[#FAEEDA] text-[#854F0B] dark:bg-[#854F0B]/20 dark:text-[#EF9F27] text-sm px-4 py-3 rounded-[8px] mb-6 flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">The statement's balances don't add up. You can still import.</p>
                <ul className="mt-1 space-y-0.5">
                  {failedChecks.map(check => (
                    <li key={`${check.fileName}-${check.id}`}>{describeCheck(check)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <SummaryStrip
            className="mb-6"
            stats={[
              { label: 'Transactions', value: `${includedRows.length} of ${rows.length}` },
              {
                label: 'Net to wallets',
                value: fmt(netToWallets),
                tone: netToWallets < 0 ? 'negative' : netToWallets > 0 ? 'positive' : 'ink',
              },
              { label: 'Duplicates', value: String(duplicateCount) },
              // The strip stays at four cells (DESIGN-SPEC §8); the balance result is carried by
              // the line below when it passes and by the banner above when it doesn't.
              ...(source === 'csv'
                ? [{ label: 'Recurring', value: String(recurringRows.length) }]
                : []),
            ]}
          />

          {source === 'csv' && csvContext.coverage.length > 0 && failedChecks.length === 0 && (
            <p className="text-[13px] text-ink-muted mb-4">
              <span className="text-positive">Balances check out</span>
              {csvContext.coverage.map(c => (
                <span key={c.fileName}>
                  {' · '}{c.fileName}: {format(parseISO(c.fromDate), 'd MMM')} – {format(parseISO(c.toDate), 'd MMM yyyy')}
                </span>
              ))}
              {csvContext.snapshots.length > 0 && (
                <> · recording {csvContext.snapshots.map(s => `${format(parseISO(s.boundaryDate), 'd MMM')} ${fmt(s.balance)}`).join(', ')}</>
              )}
            </p>
          )}

          {errors.length > 0 && (
            <div className="bg-card border border-card-border rounded-[14px] p-4 mb-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">Could not read</p>
              <ul className="space-y-1">
                {errors.map((e, i) => (
                  <li key={`${e.fileName}-${i}`} className="text-[13px] text-ink-soft">
                    <span className="text-ink">{e.fileName}</span> — {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="bg-card border border-card-border rounded-[14px] p-4 mb-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">Read with warnings</p>
              <ul className="space-y-1">
                {warnings.map((w, i) => (
                  <li key={`${w.fileName}-${i}`} className="text-[13px] text-ink-soft">
                    <span className="text-ink">{w.fileName}</span> — {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <PreviewTable
            rows={rows}
            wallets={wallets}
            onChange={updateRow}
            onAnswerRecurring={answerRecurring}
          />

          <div className="flex items-center justify-between gap-4 mt-4">
            <p className="text-[13px] text-ink-muted">
              {unanswered.length > 0
                ? `${unanswered.length} row${unanswered.length === 1 ? '' : 's'} need${unanswered.length === 1 ? 's' : ''} an answer about a recurring rule.`
                : unassigned.length > 0
                  ? `${unassigned.length} row${unassigned.length === 1 ? '' : 's'} still need a wallet.`
                  : incomeRows.length > 0
                    ? `${commitItems.length} to wallets · ${incomeRows.length} to log as income.`
                    : `${commitItems.length} transaction${commitItems.length === 1 ? '' : 's'} ready.`}
            </p>
            <button
              onClick={askConfirm}
              disabled={!canConfirm}
              className={`px-4 py-2 rounded-[9px] text-sm font-medium transition-colors ${
                canConfirm ? 'bg-ink text-cream hover:opacity-90' : 'bg-track text-ink-faint cursor-not-allowed'
              }`}
            >
              {committing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </>
      )}

      {confirm && (
        <IncomeConfirmModal
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Income hand-off — the SAME popup and executor the Income page uses.
          `key` is REQUIRED: without it React reuses the popup instance between queued rows,
          so row N+1 would open still holding row N's typed amounts against a new total. */}
      {incomeState && (
        <DistributionPopup
          key={incomeState.row.id}
          totalAmount={incomeState.row.amount}
          strictMode={strictMode}
          entryName={incomeState.row.counterparty}
          entryNote={incomeState.row.note ?? null}
          onClose={null}
          onConfirm={async (distributions) => {
            try {
              const userId = await getCurrentUserId()
              await distributeIncome({
                distributions,
                wallets,
                unallocatedWalletId,
                sourceName: incomeState.row.counterparty,
                date: incomeState.row.date,
                isAutomated: false,
                userId,
                incomeEntryId: incomeState.incomeEntryId,
                // So a re-imported statement is recognised as a duplicate next time.
                importFingerprint: incomeState.row.fingerprint,
              })
              await evaluateUnallocatedPlans(unallocatedWalletId)
            } catch (err) {
              // Keep the popup open so the user can retry, exactly as the Income page does
              // on a failed distribution edit — a silent stall would strand the income entry.
              setCommitError(
                `Could not distribute "${incomeState.row.counterparty}": ${err?.message ?? 'unknown error'}. `
                + 'The income entry was created but has no distribution yet — finish it from the Income page.',
              )
              return
            }
            const nextIndex = incomeState.index + 1
            setIncomeDone(nextIndex)
            setRows(prev => prev.filter(r => r.id !== incomeState.row.id))
            await guarded(() => startNextIncome(incomeQueue, nextIndex))
          }}
        />
      )}

      {/* A re-priced recurring INCOME needs its distribution redone before it can be logged
          again — the same mandatory step the Income page runs after an amount change. Its own
          queue, never interleaved with the income hand-off above. */}
      {ruleState && (
        <DistributionPopup
          key={`rule-${ruleState.ruleId}`}
          totalAmount={ruleState.amount}
          strictMode
          entryName={ruleState.name}
          onClose={null}
          onConfirm={(distributions, meta) => guarded(async () => {
            const ruleRows = meta?.allRows ?? []
            try {
              // An empty distribution would leave the new version unloggable, so it is reported
              // rather than written as nothing.
              if (ruleRows.length === 0) throw new Error('no wallets were given a share')
              await saveRecurringDistribution(ruleState.ruleId, ruleRows)
            } catch (err) {
              setCommitError(
                `"${ruleState.name}" was updated to ${fmt(ruleState.amount)} but its distribution `
                + `could not be saved: ${err?.message ?? 'unknown error'}. Set it from the Income page `
                + 'before logging that income again.',
              )
            }
            await startNextRuleUpdate(ruleState.index + 1)
          })}
        />
      )}
    </div>
  )
}

// Turns a failed reconciliation check into one plain sentence with both numbers. Kept next to
// the banner rather than in the lib so the numbers render through formatMoney (privacy mode
// included) instead of being frozen into a string at parse time.
function describeCheck(check) {
  if (check.id === 'chain') {
    return `${check.fileName}: row ${check.row.number} (${check.row.counterparty}) should leave `
      + `${fmt(check.expected)}, but the statement says ${fmt(check.actual)}.`
  }
  if (check.id === 'total') {
    return `${check.fileName}: ${fmt(check.opening)} plus the transactions comes to `
      + `${fmt(check.expected)}, but the closing balance is ${fmt(check.actual)}.`
  }
  return `${check.fileName}: this app recorded ${fmt(check.expected)} on `
    + `${format(parseISO(check.boundaryDate), 'd MMM yyyy')}, the statement says ${fmt(check.actual)}.`
}

// Card-less and border-less at rest, centred on BOTH axes, muted (DESIGN-SPEC §4). Empty
// states are the one place explanatory copy belongs — this one has to say what to drop and
// that nothing leaves the browser. The dashed outline appears only while a drag is over the
// page: it is drag feedback, not a boxed empty state.
function EmptyState({ dragging, onPick, errors, source }) {
  return (
    <div className="min-h-[55vh] flex flex-col items-center justify-center text-center">
      <div
        className={`rounded-[14px] px-10 py-12 border border-dashed transition-colors ${
          dragging ? 'border-accent-solid bg-accent/5' : 'border-transparent'
        }`}
      >
        <FileUp size={30} className="mx-auto mb-3 text-ink-faint dark:text-ink-soft" />
        <p className="text-sm font-medium text-ink-muted">No statements loaded</p>
        <p className="text-xs text-ink-faint mt-1 max-w-[380px]">{source.emptyCopy}</p>
        <button
          onClick={onPick}
          className="mt-5 bg-ink text-cream px-4 py-2 rounded-[9px] text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {source.pickLabel}
        </button>
      </div>

      {errors.length > 0 && (
        <ul className="mt-6 space-y-1">
          {errors.map((e, i) => (
            <li key={`${e.fileName}-${i}`} className="text-[13px] text-ink-faint">
              <span className="text-ink-muted">{e.fileName}</span> — {e.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PreviewTable({ rows, wallets, onChange, onAnswerRecurring }) {
  const selectable = wallets.filter(w => !w.is_system)

  return (
    <div className="bg-card border border-card-border rounded-[14px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-inner-border">
              <th className="px-4 py-2 w-10" />
              <th className="px-4 py-2 text-left text-[11px] font-medium text-ink-muted uppercase tracking-wider whitespace-nowrap">Date</th>
              <th className="px-4 py-2 text-left text-[11px] font-medium text-ink-muted uppercase tracking-wider">Transaction</th>
              <th className="px-4 py-2 text-left text-[11px] font-medium text-ink-muted uppercase tracking-wider w-[260px]">Wallet</th>
              <th className="px-4 py-2 text-right text-[11px] font-medium text-ink-muted uppercase tracking-wider whitespace-nowrap">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isIncome = row.direction === 'credit' && row.creditMode === 'income'
              const recurring = isRecurringHandled(row)
              const needsWallet = row.include && !row.walletId && !isIncome && !recurring
              // An excluded row is dimmed, EXCEPT while it is still asking a recurring
              // question: dimming its buttons would read as disabled, and that row is the one
              // thing standing between the user and the Import button.
              const asking = recurring && !row.recurring.answered && row.recurring.state !== 'recognised'
              return (
                <tr key={row.id} className={`even:bg-field align-top ${row.include || asking ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={row.include}
                      // A recurring-linked row has no include choice: its money moves through
                      // the recurring flow, so committing it here would double-count it. The
                      // way to import it anyway is to answer "not that rule".
                      disabled={recurring}
                      onChange={e => onChange(row.id, { include: e.target.checked })}
                      aria-label={`Include ${row.counterparty}`}
                      className="w-4 h-4 rounded border-card-border accent-[#D85A30] disabled:opacity-40"
                    />
                  </td>

                  <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap">
                    {format(parseISO(row.date), 'd MMM')}
                  </td>

                  <td className="px-4 py-2.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink">{row.counterparty}</span>
                      {row.duplicateOf && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-negative-tint text-negative">
                          {row.duplicateOf === 'existing' ? 'Already imported' : 'Duplicate in batch'}
                        </span>
                      )}
                    </div>
                    <input
                      value={row.note ?? ''}
                      onChange={e => onChange(row.id, { note: e.target.value })}
                      aria-label={`Note for ${row.counterparty}`}
                      className="mt-1 w-full max-w-[340px] px-2 py-1 border border-card-border rounded-[8px] text-[13px] bg-field text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                    <p className="text-[11px] text-ink-muted mt-1 truncate">{row.fileName}</p>
                  </td>

                  <td className="px-4 py-2.5">
                    {recurring ? (
                      <RecurringCell row={row} onAnswer={onAnswerRecurring} />
                    ) : isIncome ? (
                      <>
                        <div className="mb-1.5">
                          <Segmented
                            value={row.creditMode}
                            onChange={v => onChange(row.id, { creditMode: v })}
                            options={[
                              { value: 'refund', label: 'Refund → wallet' },
                              { value: 'income', label: 'Log as income' },
                            ]}
                          />
                        </div>
                        <p className="text-[11px] text-ink-muted">
                          Wallets are chosen in the distribution step.
                        </p>
                      </>
                    ) : (
                      <>
                        {row.direction === 'credit' && (
                          <div className="mb-1.5">
                            <Segmented
                              value={row.creditMode}
                              onChange={v => onChange(row.id, { creditMode: v })}
                              options={[
                                { value: 'refund', label: 'Refund → wallet' },
                                { value: 'income', label: 'Log as income' },
                              ]}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {row.walletId && (
                            <WalletIcon
                              wallet={selectable.find(w => w.id === row.walletId)}
                              size={14}
                              className="text-ink-soft shrink-0"
                            />
                          )}
                          <select
                            value={row.walletId}
                            onChange={e => onChange(row.id, { walletId: e.target.value })}
                            aria-label={`Wallet for ${row.counterparty}`}
                            className={selectClass}
                          >
                            <option value="">Choose a wallet…</option>
                            {selectable.map(w => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </div>
                        {row.suggestion && row.walletId === row.suggestion.walletId && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
                            <Sparkles size={11} />
                            {row.suggestion.source === 'learned' ? 'Suggested from a past import' : 'Suggested — please check'}
                          </p>
                        )}
                        {needsWallet && (
                          <p className="mt-1 text-[11px] text-negative">Pick a wallet or skip this row.</p>
                        )}
                      </>
                    )}
                  </td>

                  <td className={`px-4 py-2.5 text-right font-medium tracking-tight whitespace-nowrap ${
                    row.direction === 'debit' ? 'text-negative' : 'text-positive'
                  }`}>
                    {row.direction === 'debit' ? fmt(-row.amount) : `+${fmt(row.amount)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-ink-muted border-t border-inner-border">
        Showing {rows.length} of {rows.length} transaction{rows.length === 1 ? '' : 's'}
      </p>
    </div>
  )
}

// The recurring verdict for one row (kbc-csv-import-background.md §3). It replaces the wallet
// picker, because a row a recurring rule accounts for needs no wallet here — the rule already
// has one. Every state offers a way OUT ("not that rule"), so a wrong match can never quietly
// swallow a real transaction.
function RecurringCell({ row, onAnswer }) {
  const verdict = row.recurring
  const { state, rule, candidates = [] } = verdict

  const answer = patch => onAnswer(row.id, { answered: true, ...patch })
  const reask = () => onAnswer(row.id, {
    answered: false, rejected: false, confirmedRule: null, updateRuleAmount: false,
  })

  if (verdict.answered) {
    return (
      <div className="text-[13px]">
        <p className="flex items-center gap-1.5 text-ink-soft">
          <Repeat size={12} className="shrink-0" />
          {verdict.rejected
            ? 'Importing as a normal transaction'
            : verdict.updateRuleAmount
              ? `${verdict.confirmedRule?.name} → ${fmt(row.amount)} on import`
              : `Handled by ${verdict.confirmedRule?.name ?? rule?.name}`}
        </p>
        <button onClick={reask} className="mt-1 text-[11px] text-accent-solid hover:underline">
          Change
        </button>
      </div>
    )
  }

  if (state === 'recognised') {
    return (
      <div className="text-[13px]">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-track text-ink-soft">
          <Repeat size={11} />
          Handled by {rule.name}
        </span>
        <button
          onClick={() => answer({ rejected: true })}
          className="mt-1.5 block text-[11px] text-accent-solid hover:underline"
        >
          Not that one — import it
        </button>
      </div>
    )
  }

  if (state === 'deviation') {
    return (
      <div className="text-[13px]">
        <p className="text-ink">
          <span className="font-medium">{rule.name}</span> is {fmt(verdict.linkedAmount)}, this says {fmt(row.amount)}.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <RecurringAction onClick={() => answer({ confirmedRule: rule, updateRuleAmount: true })} primary>
            Use {fmt(row.amount)}
          </RecurringAction>
          <RecurringAction onClick={() => answer({ confirmedRule: rule, updateRuleAmount: false })}>
            Keep {fmt(verdict.linkedAmount)}
          </RecurringAction>
          <RecurringAction onClick={() => answer({ rejected: true })}>
            Not that rule
          </RecurringAction>
        </div>
      </div>
    )
  }

  // needs-confirmation — the first encounter, or a linked row that fell outside its schedule.
  return (
    <div className="text-[13px]">
      <p className="text-ink">
        {verdict.reason === 'off-schedule'
          ? <>Is this <span className="font-medium">{rule.name}</span>, early or late?</>
          : <>Is this your recurring <span className="font-medium">{rule.name}</span>?</>}
      </p>
      {candidates.length > 1 && (
        <select
          value={verdict.rule.id}
          onChange={e => onAnswer(row.id, {
            rule: candidates.find(c => c.id === e.target.value) ?? verdict.rule,
          })}
          aria-label={`Recurring rule for ${row.counterparty}`}
          className={`${selectClass} mt-1.5`}
        >
          {candidates.map(c => (
            <option key={c.id} value={c.id}>{c.name} · {fmt(c.amount)}</option>
          ))}
        </select>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <RecurringAction onClick={() => answer({ confirmedRule: rule })} primary>
          Yes, remember it
        </RecurringAction>
        <RecurringAction onClick={() => answer({ rejected: true })}>
          No, import it
        </RecurringAction>
      </div>
    </div>
  )
}

function RecurringAction({ onClick, primary, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-[8px] text-[11px] font-medium transition-colors ${
        primary
          ? 'bg-ink text-cream hover:opacity-90'
          : 'border border-card-border text-ink-soft hover:bg-track'
      }`}
    >
      {children}
    </button>
  )
}

// Bank-statement import (pdf-import-plan.md). Multi-file picker → parse → editable preview
// → confirm. NOTHING is auto-committed, and the PDFs never leave the browser: parsing is
// 100% client-side and only confirmed transactions reach the database.
//
// Two commit paths, deliberately kept separate (§3):
//   1. debits + refund credits → the transactional import_transactions RPC (all-or-nothing,
//      balance math inside the function — this page never touches a balance itself)
//   2. "log as income" credits → the EXISTING income flow (income_entries +
//      DistributionPopup + distributeIncome), reused as-is rather than reimplemented.

import { useEffect, useRef, useState } from 'react'
import { FileUp, AlertTriangle, Check, Sparkles } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase, getCurrentUserId } from '../lib/supabase'
import { extractText } from '../lib/import/extractText'
import { buildRows, toCommitItems, toIncomeRows } from '../lib/import/buildRows'
import { SUPPORTED_BANKS } from '../lib/import/detectBank'
import { distributeIncome } from '../lib/distributeIncome'
import { evaluateUnallocatedPlans } from '../lib/unallocatedPlans'
import { formatMoney } from '../lib/format'
import { WalletIcon } from '../lib/walletIcons'
import PageHeader from '../components/ui/PageHeader'
import SummaryStrip from '../components/ui/SummaryStrip'
import DistributionPopup from '../components/DistributionPopup'
import IncomeConfirmModal from '../components/IncomeConfirmModal'

const fmt = n => formatMoney(n)

const SUPPORTED_LABEL = SUPPORTED_BANKS.map(b => b.label).join(', ')

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

  const [wallets, setWallets] = useState([])
  const [mappings, setMappings] = useState([])
  const [dbFingerprints, setDbFingerprints] = useState([])
  const [preferredBank, setPreferredBank] = useState(null)
  const [strictMode, setStrictMode] = useState(true)
  const [unallocatedWalletId, setUnallocatedWalletId] = useState(null)
  const [loading, setLoading] = useState(true)

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

  useEffect(() => { fetchContext() }, [])

  async function fetchContext() {
    const [wRes, mRes, tRes, sRes, uaRes] = await Promise.all([
      supabase.from('wallets').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('counterparty_wallet_mappings').select('counterparty_key, wallet_id'),
      supabase.from('transactions').select('import_fingerprint').not('import_fingerprint', 'is', null),
      supabase.from('settings').select('strict_distribution, bank_provider').single(),
      supabase.from('wallets').select('id').eq('is_system', true).single(),
    ])
    setWallets(wRes.data ?? [])
    setMappings(mRes.data ?? [])
    setDbFingerprints((tRes.data ?? []).map(r => r.import_fingerprint))
    setStrictMode(sRes.data?.strict_distribution ?? true)
    setPreferredBank(sRes.data?.bank_provider ?? null)
    setUnallocatedWalletId(uaRes.data?.id ?? null)

    // A failed query here degrades the feature SILENTLY — no mappings means no suggestions,
    // and no fingerprints means duplicate detection is off while still reporting "0
    // duplicates". That must be visible, not inferred from an empty table.
    const degraded = []
    if (mRes.error) degraded.push('wallet suggestions are unavailable')
    if (tRes.error) degraded.push('duplicate detection is off')
    if (wRes.error) degraded.push('wallets could not be loaded')
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
    // (and interleave two batches' dedupe), so ignore it rather than half-handle it.
    if (progress !== null) return

    const dropped = Array.from(fileList ?? [])
    const files = dropped.filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    )
    if (files.length === 0) {
      setPickWarning(dropped.length > 0
        ? 'Those files are not PDFs. Import reads the PDF statements exported from your banking app.'
        : null)
      return
    }
    setPickWarning(dropped.length > files.length
      ? `${dropped.length - files.length} non-PDF file${dropped.length - files.length === 1 ? '' : 's'} ignored.`
      : null)

    setResult(null)
    setCommitError(null)
    setProgress({ done: 0, total: files.length })

    const extracted = []
    const readFailures = []
    for (const file of files) {
      try {
        const { text } = await extractText(file)
        extracted.push({ fileName: file.name, text })
      } catch (err) {
        readFailures.push({ fileName: file.name, reason: err.message })
      }
      setProgress(p => (p ? { done: p.done + 1, total: p.total } : p))
    }

    const built = buildRows(extracted, {
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
    setProgress(null)
  }

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function reset() {
    setRows([])
    setErrors([])
    setWarnings([])
    setResult(null)
    setCommitError(null)
    setIncomeQueue([])
    setIncomeState(null)
    setIncomeDone(0)
  }

  // ─── Commit ────────────────────────────────────────────────────────────────

  const commitItems = toCommitItems(rows)
  const incomeRows = toIncomeRows(rows)
  const includedRows = rows.filter(r => r.include)
  const duplicateCount = rows.filter(r => r.duplicateOf).length
  // Rows the user included but left without a wallet — they'd be silently dropped, so the
  // confirm button is blocked until each one is resolved.
  const unassigned = includedRows.filter(r => r.walletId === '' && r.creditMode !== 'income')

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

  const canConfirm = !committing && unassigned.length === 0 &&
    (commitItems.length > 0 || incomeRows.length > 0)

  function askConfirm() {
    setConfirm({
      title: 'Import these transactions?',
      body: (
        <span>
          Commit <strong>{commitItems.length}</strong> transaction{commitItems.length === 1 ? '' : 's'} to your wallets
          {incomeRows.length > 0 && <> and log <strong>{incomeRows.length}</strong> as income</>}.
          {duplicateCount > 0 && <> {duplicateCount} flagged duplicate{duplicateCount === 1 ? '' : 's'} {rows.filter(r => r.duplicateOf && r.include).length > 0 ? 'included as chosen' : 'skipped'}.</>}
        </span>
      ),
      confirmLabel: 'Import',
      variant: 'primary',
      onConfirm: runCommit,
    })
  }

  async function runCommit() {
    setConfirm(null)
    setCommitting(true)
    setCommitError(null)

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

    // Drop the rows now committed; anything left is an income row awaiting distribution.
    const committedIds = new Set(
      rows.filter(r => r.include && r.walletId && r.creditMode !== 'income').map(r => r.id),
    )
    setRows(prev => prev.filter(r => !committedIds.has(r.id)))

    if (incomeRows.length > 0) {
      setIncomeQueue(incomeRows)
      setIncomeDone(0)
      setResult({ debits: committedDebits, credits: committedCredits, income: 0, pending: incomeRows.length })
      await startNextIncome(incomeRows, 0)
      return
    }

    setCommitting(false)
    setResult({ debits: committedDebits, credits: committedCredits, income: 0, pending: 0 })
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
        meta={`${SUPPORTED_LABEL} · Export KBC Mobile`}
        actions={
          rows.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={reset}
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

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
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
            {result.pending > 0 && <> · {incomeDone} of {result.pending} logged as income</>}.
          </span>
        </div>
      )}

      {loading ? (
        <p className="text-ink-faint text-sm">Loading…</p>
      ) : busy ? (
        <p className="text-ink-muted text-sm">Reading {progress.done} of {progress.total} file{progress.total === 1 ? '' : 's'}…</p>
      ) : rows.length === 0 ? (
        <EmptyState dragging={dragging} onPick={() => fileInputRef.current?.click()} errors={errors} />
      ) : (
        <>
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
            ]}
          />

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
          />

          <div className="flex items-center justify-between gap-4 mt-4">
            <p className="text-[13px] text-ink-muted">
              {unassigned.length > 0
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
            await startNextIncome(incomeQueue, nextIndex)
          }}
        />
      )}
    </div>
  )
}

// Card-less and border-less at rest, centred on BOTH axes, muted (DESIGN-SPEC §4). Empty
// states are the one place explanatory copy belongs — this one has to say what to drop and
// that nothing leaves the browser. The dashed outline appears only while a drag is over the
// page: it is drag feedback, not a boxed empty state.
function EmptyState({ dragging, onPick, errors }) {
  return (
    <div className="min-h-[55vh] flex flex-col items-center justify-center text-center">
      <div
        className={`rounded-[14px] px-10 py-12 border border-dashed transition-colors ${
          dragging ? 'border-accent-solid bg-accent/5' : 'border-transparent'
        }`}
      >
        <FileUp size={30} className="mx-auto mb-3 text-ink-faint dark:text-ink-soft" />
        <p className="text-sm font-medium text-ink-muted">No statements loaded</p>
        <p className="text-xs text-ink-faint mt-1 max-w-[380px]">
          Drop your {SUPPORTED_LABEL} “Export KBC Mobile” PDFs here — one file per transaction.
          They are read in your browser and never uploaded; nothing is saved until you confirm.
        </p>
        <button
          onClick={onPick}
          className="mt-5 bg-ink text-cream px-4 py-2 rounded-[9px] text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Choose PDFs
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

function PreviewTable({ rows, wallets, onChange }) {
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
              const needsWallet = row.include && !row.walletId && !isIncome
              return (
                <tr key={row.id} className={`even:bg-field align-top ${row.include ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={e => onChange(row.id, { include: e.target.checked })}
                      aria-label={`Include ${row.counterparty}`}
                      className="w-4 h-4 rounded border-card-border accent-[#D85A30]"
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

                    {isIncome ? (
                      <p className="text-[11px] text-ink-muted">
                        Wallets are chosen in the distribution step.
                      </p>
                    ) : (
                      <>
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

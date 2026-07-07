# Finishing the Distribution Logic & Unallocated Wallet

> Companion to PROJECT-CONTEXT.md. Read that first for full project state. This file covers the
> ACTIVE phase: finishing income-distribution edit (Fix C), then building the Unallocated wallet
> outbound interface (Stage 4). Schema for all of this ALREADY EXISTS in the live DB.

---

## Overall goal & context

The income-distribution system was redesigned to support mixed €/% assignment, reusable templates
(attached to income templates), and a clean inspect/edit of where logged income went. That part is
essentially done (Stages 1–3, Fixes A/B/C). The remaining big piece is the **Unallocated wallet
outbound interface** (Stage 4): turning the Unallocated wallet from a credit-only, read-only catch-all
into something you can actively distribute OUT of, with reusable templates and automatic
threshold-triggered plans.

All the database tables needed already exist (see PROJECT-CONTEXT.md section 4): `unallocated_templates`
(+ items), `unallocated_plans` (+ items), and the `edit_income_distribution` RPC. So Stage 4 is mostly
frontend + wiring + a check-on-change evaluation, not new schema (with the possible exception of a
small helper if needed for the stall state — decide during build).

---

## Current standing of the active phase

DONE & verified:
- Stage 1 schema, Stage 2 mixed €/% income distribution UI, Stage 3/Fix B full income templates with
  distribution, Fix A popup sizing.
- Fix C: `income_entry_id` column + `edit_income_distribution` transactional RPC (verified correct);
  income_entry_id threading + read-only inspect view implemented; edit-button wiring just instructed.

IMMEDIATE NEXT (finish Fix C):
- Test the edit-distribution wiring end to end. IMPORTANT: only incomes created AFTER the threading
  was added have income_entry_id, so test with a freshly created income (older ones correctly show
  "Distribution details aren't available" and hide edit).
- Test steps: create a new manual income, distribute it across wallets, open its detail modal, confirm
  the Distribution section shows the right per-wallet amounts, click Edit distribution, change the
  split, confirm. Then the assistant verifies via the Supabase connector that balances netted out
  exactly (no drift) and the credit rows were replaced and linked by income_entry_id.

---

## Stage 4 — Unallocated wallet outbound interface (the remaining build)

### Where it lives
On the Unallocated wallet's detail page (currently just a static description + read-only incoming
transactions list). This page gets expanded into the full interface below.

### Approved design (from the mockup)
Header: Unallocated balance shown as "available to distribute" + the description of what it collects.

Two primary actions:
- **Distribute now** — opens the Stage-2 DistributionPopup, adapted so the total being distributed is
  a chosen amount taken OUT of Unallocated and sent TO other wallets (rather than incoming income).
  Reuse the same %/€ interface. Money leaving Unallocated decrements it; money arriving in targets
  increments them. Use atomic RPCs; consider whether a dedicated transactional function (like
  edit_income_distribution) is warranted for the multi-wallet move to keep it all-or-nothing — RECOMMENDED,
  since it's a multi-step balance mutation; if so, the assistant writes/verifies that function via the
  connector and Claude Code just calls it (same pattern as Fix C).
- **New auto-plan** — create a threshold-triggered plan (writes unallocated_plans + items).

Templates section:
- Lists the user's `unallocated_templates`. Tap to apply (prefills a Distribute-now distribution).
- **Affordable templates at full opacity on top; unaffordable ones greyed out and pushed to the
  bottom** with an "unavailable / needs €X" marker, judged against the current Unallocated balance.
- An explicit **"Create template" button** here (so saving from a manual distribute is NOT the only
  way to make one) — ADD THIS (it was an explicit owner request).

Automatic plans section:
- Lists `unallocated_plans`, each showing its trigger condition and what it does, with an on/off toggle
  (is_active). distribute_mode phrasing: `amount_over_threshold` = "sweep everything above €X";
  `fixed_amount` = "distribute €Y"; `full_balance` = "distribute the full balance".
- Plans fire via **CHECK-ON-CHANGE**: after any action that changes the Unallocated balance (income
  distribution, a manual distribute, etc.), evaluate active plans. A plan is eligible when the balance
  crosses/exceeds its threshold. Eligible plans re-arm and can fire repeatedly.

The multi-plan STALL (important):
- If MORE THAN ONE plan is eligible at the same evaluation (any simultaneous eligibility counts as
  competing, even different target wallets), do NOT fire any of them automatically. Instead halt and
  record a pending state, and present the eligible plans to the user to CHOOSE which to apply.
- This prompt should surface PROMINENTLY on login / the dashboard (not buried only on the Unallocated
  page) — a conflict banner like "N plans triggered at once. Choose which to apply." with a Review action.
- A single eligible plan with no competition may fire automatically (confirm this is the desired
  behaviour during build; the safe alternative is to always require confirmation — decide explicitly).

History tab (owner request):
- Add a history tab on the Unallocated page to track everything that happened (incoming credits,
  outgoing distributions, plan firings). Derive from transactions (and possibly a small log if needed).

### Open questions to confirm before/while building Stage 4
1. Manual "Distribute now": confirm reusing DistributionPopup (adapted for outbound) is right, and
   whether the multi-wallet move gets its own transactional function (RECOMMENDED) vs client-side RPCs.
2. Single-eligible-plan: auto-fire, or always confirm? (Multi-plan always stalls — that's decided.)
3. Exactly what the history tab shows and whether it needs any new storage or is fully derivable from
   transactions.
4. Where precisely the conflict banner lives (dashboard + Unallocated page) and how "pending stall"
   state is stored so it persists until the user resolves it.

### Build approach
Stage it like the income work: small, verifiable steps. Suggested order:
- 4a: Unallocated detail page scaffold + "Distribute now" manual outbound (with its transactional
  function if chosen). Verify balances via connector.
- 4b: Unallocated templates (create button, save, apply, affordable/greyed sorting).
- 4c: Auto-plans (create, list, toggle) + check-on-change evaluation + single-plan auto-fire.
- 4d: Multi-plan stall + pending state + prominent login/dashboard conflict banner + Review flow.
- 4e: History tab.

Each step: Claude Code reads the real files first, explains its plan, waits for approval; assistant
verifies resulting data via the connector after the owner tests on localhost.

---

## How a new chat should pick this up
1. Read PROJECT-CONTEXT.md fully, then this file.
2. Confirm with the owner whether Fix C edit-wiring is tested/verified yet; if not, finish that first.
3. For Stage 4, verify the live schema for the unallocated_* tables (via connector) so instructions
   match reality, then proceed step by step (4a→4e), writing Claude Code instructions and verifying
   data after each.
4. Resolve the four open questions above with the owner before the steps they affect.
5. Keep PROJECT-CONTEXT.md sections 6 & 7 updated as stages complete.

# PHASE-ROADMAP.md — how to start the work that has not started

> **This file carries no status.** Status lives in `PROJECT-CONTEXT.md` §6 and nowhere else.
> Everything below is work that has **not begun**. When a phase ships, delete it from here and
> record it in §6 — do not annotate it in place, or this file starts contradicting §6 again.
>
> Open decisions live in `OPEN-QUESTIONS.md`.

Standing pattern: **new chat = paste/attach `PROJECT-CONTEXT.md` + this file's relevant section
(+ the phase's plan file if one exists).** New Claude Code session = the kickoff prompt below.
Every session ends with the `wrapup` skill so `PROJECT-CONTEXT.md` stays the bridge between chats.
One chat per phase; don't drag finished phases along.

Two kinds of phase start:

- **CHAT-FIRST** — needs a design/decision conversation (with mockups or option trade-offs) before
  any code. Do it in a claude.ai chat; output = decisions folded into a short plan file, then
  Claude Code builds.
- **CODE-FIRST** — decisions already made; go straight to Claude Code plan mode with the kickoff
  prompt.

---

## Phase A — Dashboard rebuild — CHAT-FIRST

The content/metrics redesign the reskin deliberately did not do.

**Recon already exists:** `docs/dashboard-recon.md` — a read-only inventory of what the dashboard
currently computes and renders. Read it before the chat. Note its §4: the nine baseline screenshots
it cited were deleted in the 2026-09 cleanup and **must be re-captured** from the test account
before design work starts.

Chat conversation to have first (with mockups): what does the dashboard exist to answer? Candidate
jobs to rank — current standing (balances), month performance (income/spent/net vs prior),
projection (the existing projected-balance chart — keep/evolve), attention items (plan stalls,
overdue, underfunded, over-cap), wallet progress. Decide: which metrics, what hierarchy, what gets
cut.

Output: `docs/plans/dashboard-redesign-plan.md` (metrics chosen, layout sketch/mockup reference,
cut list).

Supply for the chat: `PROJECT-CONTEXT.md`, `DESIGN-SPEC.md`, `docs/dashboard-recon.md`, fresh
screenshots of the current dashboard, `docs/testing-notes.md`.

**Carries a testing prerequisite** (`OPEN-QUESTIONS.md` Q7): `src/lib/dashboardCalcs.js` reads
`new Date()` internally at four points, which is why 268 lines and 10 exports have only 6 tests.
This phase is the agreed place to thread an injectable `now` through them.

Kickoff prompt (after the plan file exists):
> "Feature: dashboard rebuild. Branch `b/dashboard-rebuild`. Plan mode first. Read
> `docs/plans/dashboard-redesign-plan.md` + `DESIGN-SPEC.md`. REQUIREMENT from testing-notes: all
> new/changed time-relative calcs take an injectable `now` parameter and ship with behaviour tests
> (this closes the deferred projection-test gap). Charts inline SVG per spec §6. No schema changes
> expected; if any arise, `db-migration` skill + STOP. Standard gates: tests, design-check,
> code-reviewer, Playwright screenshots both themes, db-verifier if any data paths changed, wrapup."

---

## Phase B — Backup / export-import — CHAT-FIRST (short)

Plan already exists: `docs/plans/backup-restore-feature-plan.md`. The chat is a review/refresh of
that plan — it predates the two-tier reset, the `unallocated_*` tables, the redesign and both
import sources — so reconcile it first, then build. **Prerequisite for encryption.** Settings hosts
the entry point.

Supply: `PROJECT-CONTEXT.md`, `docs/plans/backup-restore-feature-plan.md`, `DESIGN-SPEC.md`.

---

## Phase C — Client-side encryption — CHAT-FIRST (big)

Only after backup ships. The plan file (`docs/plans/encryption-with-key-plan.md`) still has two
open discussions to resolve in chat first: balance atomicity without DB-side math, and which
features lose DB-side filtering/sorting. The behaviour test suite is the safety net for this
migration — **do not weaken it beforehand.**

Supply: `PROJECT-CONTEXT.md`, `docs/plans/encryption-with-key-plan.md`, `docs/testing-notes.md`.

---

## Parked

- **Investment wallet type** (phase 7 of the old numbering).
- **AI features** (natural-language transaction entry). The PDF-import phase considered and
  **rejected** Claude-API extraction in favour of a deterministic parser, because bank statements
  are sensitive — so the "AI writes transactions safely" rails were never built. Revisit only with
  that trade-off in mind.
- **Splitting the three oversized page components** (`Income.jsx` 1225 lines, `Import.jsx` 1194,
  `WalletDetail.jsx` 989). Assessed in `docs/audit/STRUCTURE-REVIEW.md` and deliberately **not**
  proposed: it is a refactor rather than a relocation, and nothing under `src/pages/` has a test to
  catch a mistake. Gated behind `OPEN-QUESTIONS.md` Q6 and Q1.

---

*Maintain this file forward-only: when a phase finishes, delete it here and record it in
`PROJECT-CONTEXT.md` §6. Adjust downstream prompts if decisions changed.*

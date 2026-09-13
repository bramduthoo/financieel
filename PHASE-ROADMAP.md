# PHASE-ROADMAP.md — remaining phases, supply documents & kickoff prompts

> How to start each remaining phase, in order. Standing pattern:
> **new chat = paste/attach PROJECT-CONTEXT.md + this file's relevant section (+ the
> phase's plan file if one exists).** New Claude Code session = the kickoff prompt below.
> Every session ends with the wrapup skill so PROJECT-CONTEXT.md stays the bridge
> between chats. One chat per phase; don't drag finished phases along.

Two kinds of phase starts:
- **CHAT-FIRST** — needs a design/decision conversation (with mockups or option
  trade-offs) before any code. Do it in a claude.ai chat, output = decisions folded
  into a short plan file, then Claude Code builds.
- **CODE-FIRST** — decisions already made; go straight to Claude Code plan mode with
  the kickoff prompt.

---

## Phase 1 — Privacy mode (small follow-up) — CODE-FIRST
Unblocked by the redesign's formatMoney(). Do right after R2 merges, ~1 session.

Supply: PROJECT-CONTEXT.md, DESIGN-SPEC.md.

Kickoff prompt:
"Feature: privacy mode. Branch b/privacy-mode. Plan mode first. Add a
hide_balances boolean to settings (draft migration per db-migration skill — STOP
for the owner to apply via the chat assistant, then verify read-only). Settings
toggle per DESIGN-SPEC. When on, formatMoney() renders '€ •••' everywhere; expose
the flag via context so toggling re-renders live. Quick-toggle affordance in the
sidebar/header is a plus — propose in plan. Tests for the masked formatter.
Playwright: toggle on, screenshot dashboard+wallets both themes, verify no real
amount visible. Standard gates + wrapup."

## Phase 2 — Dashboard rebuild (feature c) — CHAT-FIRST
The content/metrics redesign the reskin deliberately did not do.

Chat conversation to have first (with mockups): what does the dashboard exist to
answer? Candidate jobs to rank: current standing (balances), month performance
(income/spent/net vs prior), projection (the existing projected-balance chart —
keep/evolve), attention items (plan stalls, overdue, underfunded, over-cap),
wallet progress. Decide: which metrics, what hierarchy, what gets cut. Also
decide the deferred testability fix scope here.
Output: dashboard-redesign-plan.md (metrics chosen, layout sketch/mockup
reference, cut list).

Supply for the chat: PROJECT-CONTEXT.md, DESIGN-SPEC.md, screenshot of current
dashboard, docs/testing-notes.md (the now-parameter deferral).

Kickoff prompt (after the plan file exists):
"Feature: dashboard rebuild. Branch b/dashboard-rebuild. Plan mode first. Read
dashboard-redesign-plan.md + DESIGN-SPEC.md. REQUIREMENT from testing-notes:
all new/changed time-relative calcs take an injectable now parameter and ship
with behaviour tests (this closes the deferred projection-test gap). Charts
inline SVG per spec §6. No schema changes expected; if any arise, db-migration
skill + STOP. Standard gates: tests, design-check, code-reviewer, Playwright
screenshots both themes, db-verifier if any data paths changed, wrapup."

## Phase 3 — PDF transaction import (feature b) — CHAT-FIRST
Genuinely new subsystem; two design questions gate everything:
1) Parsing approach: deterministic parser per bank format vs Claude API
   extraction (friend's API credit; cost/privacy trade-off — statements are
   sensitive) vs hybrid (parser first, AI fallback).
2) Product flow: upload → parsed preview table → user assigns wallets →
   confirm as debit/credit transactions? Duplicate detection? Which banks
   first (get 1–2 real anonymized statements as fixtures).
Output: pdf-import-plan.md.

Supply for the chat: PROJECT-CONTEXT.md, a sample bank statement PDF
(anonymized), DESIGN-SPEC.md.

Also: before the build session, have a Claude Code RESEARCH subagent survey
JS PDF-parsing options (pdf.js text extraction vs server/edge processing) and
Belgian bank statement formats — keep the noise out of the build session.

Kickoff prompt (after the plan file exists):
"Feature: PDF import. Branch b/pdf-import. Plan mode first. Read
pdf-import-plan.md. Build in this order: (1) parsing pipeline as pure
functions in src/lib/ with unit tests against the fixture statements in
test-fixtures/ (NEVER commit real statements — anonymized fixtures only);
(2) preview/confirm UI per DESIGN-SPEC; (3) commit path: transactions are
inserted ONLY via the existing RPC/balance rules — no client-side balance
math; propose in your plan whether a transactional import function (like
edit_income_distribution) is needed; if yes, db-migration skill + STOP for
owner apply. Duplicate handling per plan file. Standard gates + db-verifier
invariants on an imported batch + wrapup."

## Phase 4 — Backup / export-import — CHAT-FIRST (short)
Plan already exists: backup-restore-feature-plan.md. Chat conversation is a
review/refresh of that plan (it predates: two-tier reset, unallocated tables,
redesign) — reconcile, then build. Prerequisite for encryption. Settings hosts
the entry point.

Supply: PROJECT-CONTEXT.md, backup-restore-feature-plan.md, DESIGN-SPEC.md.

## Phase 5 — Client-side encryption — CHAT-FIRST (big)
Only after backup ships. The plan file (encryption-with-key-plan.md) still has
two open discussions to resolve in chat first: balance atomicity without
DB-side math, and which features lose DB-side filtering/sorting. The behaviour
test suite is the safety net for this migration — do not weaken it beforehand.

Supply: PROJECT-CONTEXT.md, encryption-with-key-plan.md, testing notes.

## Parked (unchanged)
- Investment wallet type (phase 7 of old numbering).
- AI features (natural-language transaction entry) — revisit after PDF import,
  which will have built the "AI writes transactions safely" rails if the
  Claude-API route is chosen.

---
*Maintain this file like PROJECT-CONTEXT: when a phase finishes, mark it and
adjust downstream prompts if decisions changed.*

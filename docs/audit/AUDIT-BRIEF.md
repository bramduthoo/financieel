# AUDIT-BRIEF.md — Financieel audit, cleanup & questionnaire operation

> Commit this to `docs/audit/AUDIT-BRIEF.md`. Every session in this operation starts by
> reading this file. The per-session prompt is one line: *"Read docs/audit/AUDIT-BRIEF.md.
> Execute SESSION N. Follow all ground rules."*

---

## 0. What this operation is

The Financieel project has grown past the organisation that was designed for it. Documentation
has drifted from reality, the repo has accumulated dead artefacts, and there is no single
trustworthy statement of where the project stands or where it is going.

This operation produces that statement. In six bounded sessions it will:

1. Build an expert-level, evidence-based understanding of the codebase as it actually is.
2. Propose and (after approval) execute a cleanup of dead files.
3. Assess whether the folder structure is still fit for purpose.
4. Rewrite the progress/scope documentation to match reality.
5. Produce an extensive questionnaire covering both the current state and the target state.

The questionnaire is the deliverable that matters most. Everything before it exists to make it
accurate and complete.

---

## 1. Ground rules — non-negotiable

**All existing rules in `CLAUDE.md` remain in force.** This brief adds to them, never overrides.
In particular: never push to `main`, never force-push, never apply a write migration, never
compute wallet balances client-side.

1. **Read-only by default.** Sessions 1, 2, 4 and 6 must not modify, create, delete, stage or
   commit anything except their own named output artefact under `docs/audit/`. Sessions 3 and 5
   modify files, but only items carrying an explicit approval (see §3).
2. **Branch, never main.** Before any session that writes: `git fetch origin --prune`, then work
   on `b/audit-cleanup` cut from `origin/main`. If that branch already exists, use it.
3. **Never touch the database.** No `apply_migration`, no writes of any kind. The read-only
   Supabase MCP may be used to *verify* schema claims against the live DB — that is encouraged,
   because several documentation errors are expected to be schema-related.
4. **Never delete anything not explicitly approved.** No exceptions, no "obviously dead" files.
5. **The decision log is append-only.** `PROJECT-CONTEXT.md` §7 records *why* choices were made.
   Entries may be reworded for clarity, reordered, or grouped — but no decision may be deleted or
   have its meaning changed, and nothing may be silently dropped. If an entry is obsolete, mark
   it superseded and say what superseded it. This log is the most valuable artefact in the repo.
6. **Verify, don't assume.** This project has been burned repeatedly by acting on assumed state.
   Every factual claim you write into an artefact must be traceable to a file you actually read,
   a command you actually ran, or a query you actually executed. Where you are inferring rather
   than verifying, say so explicitly with the word "INFERRED".
7. **Never invent a finding to fill a section.** An empty section with "nothing found" is a
   correct and useful result. Padding destroys the signal.
8. **Stay in scope.** Do not fix bugs, refactor, improve code, or update comments while auditing,
   however tempting. Record it; do not act on it. Fixes are a later phase with its own approval.

---

## 2. Where artefacts live

All operation artefacts live in `docs/audit/`. Fixed names — later sessions read earlier outputs
by name, so do not rename or relocate.

| File | Written by | Read by |
|---|---|---|
| `AUDIT-BRIEF.md` | (this file) | every session |
| `PROGRESS.md` | every session | every session |
| `INVENTORY.md` | Session 1 | 2, 4, 5, 6 |
| `UNDERSTANDING.md` | Session 1 | 4, 5, 6 |
| `DISCREPANCIES.md` | Session 1 | 5, 6 |
| `CLEANUP-PROPOSAL.md` | Session 2 | 3 |
| `STRUCTURE-REVIEW.md` | Session 4 | 5 |
| `DOCS-PROPOSAL.md` | Session 5 | 5 |
| `QUESTIONNAIRE.md` | Session 6 | (the owner) |

---

## 3. The review-file protocol

> **See also `AUDIT-BRIEF-ADDENDUM.md` — required.** It applies from Session 2 onward: it amends
> Session 4's stance to a default verdict of "no change needed", and it requires every session that
> produces a decision file to also ship a self-contained offline HTML review interface with a
> JSON-export write-back loop.

This is how the owner approves work. There is no GUI; the review file **is** the interface.

Any session proposing consequential change writes a file of numbered decision blocks in exactly
this format:

```
### C-014 · docs/density-screenshots/wallets-dark.png
**What it is:** Playwright screenshot produced during the density pass (2026-07-14).
**Why it may go:** Shows a UI superseded by the R2 redesign. Not referenced by any file
  (verified: grep for the filename across the repo returns only itself).
**Risk if actioned:** None identified.
**Alternative:** Keep as historical record of the pre-R2 UI.
**Proposed action:** DELETE
**DECISION:** ?
**Notes:**
```

Rules:

- **ID prefixes:** `C-` cleanup, `S-` structure, `D-` docs, `Q-` questionnaire. Numbered
  sequentially, never reused.
- **`DECISION:` is always written as `?`** by you. Only the owner changes it.
- Permitted owner values: `ok` (do it), `no` (leave it), `defer` (revisit later), or free text
  after `note:` which you must read and honour.
- **You may never execute an item whose DECISION is still `?`.** Report it as skipped.
- **You may never edit a decision block's `DECISION:` or `Notes:` fields.** Those are the
  owner's.
- Group blocks under headings by category, and open the file with a one-screen summary: how many
  items, by category, and which ones you consider highest-risk.
- Order blocks so the safest and most obvious come first. Reviewer fatigue is real; do not open
  with the hardest judgement call.
- If two items must be decided together (deleting A only makes sense if B goes too), say so
  explicitly in both blocks and give the paired ID.

---

## 4. Sessions

### SESSION 1 — AUDIT (read-only)

**Goal:** expert-level understanding of the project as it actually is, evidenced.

Read the repository exhaustively: every file under `src/`, every `.md` in the root and `docs/`,
`supabase/migrations/`, `.claude/` (skills, agents, hooks, settings), config files,
`package.json`, CI workflow. Skip `node_modules`, build output, and binary assets (note that they
exist; do not open them).

Where a documentation claim concerns the database schema, verify it against the live DB with the
read-only MCP rather than trusting the document.

Produce three artefacts.

**`INVENTORY.md`** — the factual map. Optimise for signal density; this gets read into limited
context windows later. Never paste whole source files.

- Git state: current branch, `git status --short`, `git branch -vv` (flag `[gone]`), last 15
  commits, every branch's ahead/behind vs `origin/main`, and — importantly — **every open PR
  branch you can detect locally, with what it contains and whether it appears merged.** Call this
  out prominently; outstanding PRs block later sessions.
- Dependencies and scripts from `package.json`, with versions. Flag unused or suspicious ones.
- File tree of `src/`, `docs/`, `supabase/`, `.claude/` with per-file line counts. Flag files
  over 400 lines.
- Routes: path → component → file. For each page, 2–3 lines on purpose, what it queries, which
  modals it mounts.
- For **every** file in `src/lib/`: line count, purpose, every exported function with signature
  and one-line behaviour, whether it is pure, whether it has tests and how many, and whether it
  calls `new Date()`/`Date.now()` without an injectable parameter.
- For every file in `src/components/`: line count, one-line purpose, grouped by folder, marked
  shared-primitive vs feature-specific.
- Rule-compliance grep with real `file:line` hits: client-side `wallets.balance` writes; money
  formatting bypassing `formatMoney()`; `indigo|purple|violet`; `font-bold`/`font-semibold` on
  numerics; inserts missing `user_id`; and every `supabase.rpc(` call site.
- Every `TODO`/`FIXME`/`HACK`/`XXX`/`KNOWN` comment, **quoted verbatim** with `file:line`.
- Tests: total count and the pass/fail summary line from `npm test`; per test file what it
  covers; what in `src/lib/` has no coverage at all.
- Every `.md` in root and `docs/` with line count and one-line description.
- `DESIGN-SPEC.md`: full section headings, 2–4 line summary per section, and the complete design
  token table quoted verbatim.
- `supabase/migrations/`: each file's date, name, purpose line, and whether anything indicates it
  was applied.
- Build health: `npm run build` and `npm run lint` — pass/fail, error and warning counts, and the
  distinct lint rule names hit with counts. Do not paste full output.

**`UNDERSTANDING.md`** — the reasoned map. This is where you demonstrate genuine comprehension
rather than listing. Explain, in your own words:

- What the app is and who it is for, as evidenced by the code (not by the docs).
- The wallet model and the money lifecycle: how a euro enters the system, how it is distributed,
  where balances change, and every code path that can move money. Be exhaustive about the write
  paths — this is the highest-risk surface in the project.
- Each major subsystem, how it works, and how it connects to the others: distribution, capped
  wallets, unallocated outbound, budgeting, imports (PDF and CSV), recurring rules, settings,
  auth/multi-user.
- The data model as it actually is, including anything dead or vestigial.
- The design system and how theming actually works in practice.
- The testing strategy: what is protected and what is not.
- What is genuinely half-built, abandoned mid-flight, or inconsistent with itself (two patterns
  doing one job).
- Which parts you would consider risky for an autonomous agent to modify unsupervised, and why.
- What surprised you — things true of the codebase that are **not** written in `CLAUDE.md` or
  `PROJECT-CONTEXT.md`.

**`DISCREPANCIES.md`** — every place documentation and reality disagree. One row per
discrepancy: the claim, where it is made, what is actually true, and the evidence. Include stale
status claims (a phase described as pending that has shipped, or vice versa), schema claims
contradicted by the live DB, references to files that no longer exist, and rules stated in
`CLAUDE.md` that the code violates.

Do not propose fixes here. Recording is the job.

**Gate:** the owner reads `INVENTORY.md`'s git section and decides what to do with every open PR
before Session 2 runs. Say so explicitly at the end of the session.

---

### SESSION 2 — CLEANUP PROPOSAL (read-only)

**Prerequisite:** open PRs resolved. If `INVENTORY.md` still shows unmerged branches and the
owner has not said otherwise, stop and say so rather than proposing deletions.

Read `INVENTORY.md` and `UNDERSTANDING.md`. Identify every file that is plausibly dead weight and
write `CLEANUP-PROPOSAL.md` using the §3 block format.

Categories to sweep: superseded screenshots and image artefacts; prompt files and instruction
drafts already consumed; plan files for shipped phases; recon and investigation reports whose
conclusions have been folded elsewhere; duplicated or superseded documentation; orphaned test
fixtures; stray build output or editor files; unreferenced source files and unused exports;
anything in the repo root that belongs in a subfolder.

For **every** candidate you must establish and state whether it is referenced anywhere —
`grep` for the filename across the repo and say what you found. An unreferenced file is not
automatically dead (a plan file is referenced by nobody and may still matter), so judge purpose,
not just links.

Propose one of: `DELETE`, `ARCHIVE` (move to `docs/archive/`), `MOVE` (with destination), or
`KEEP-BUT-FLAG` (stays, but is stale and should be noted).

Prefer `ARCHIVE` over `DELETE` for anything with historical or explanatory value. Deletion is for
genuine noise: build artefacts, superseded screenshots, consumed prompts.

Never propose deleting: anything under `supabase/migrations/`, `.claude/`, `test-fixtures/`,
`DESIGN-SPEC.md`, `CLAUDE.md`, `PROJECT-CONTEXT.md`, or any file with uncommitted changes.

End with a count by category and your three highest-risk proposals named explicitly.

---

### SESSION 3 — CLEANUP EXECUTE

Read `CLEANUP-PROPOSAL.md`. Execute **only** blocks marked `ok`, honouring any `note:`.

Work on `b/audit-cleanup`. Use `git rm` for tracked files (Windows/PowerShell: `Remove-Item
-Recurse -Force`, never `rm -rf`). Commit in logical batches with messages naming the block IDs
(`chore(audit): archive superseded screenshots [C-012..C-019]`).

After executing: run `npm run build`, `npm test`, and `npm run lint`. If any regresses versus the
counts in `INVENTORY.md`, stop, revert the offending batch, and report. A cleanup that breaks the
build is a failed cleanup.

Write the outcome into `PROGRESS.md`: executed, skipped, deferred, with IDs.

---

### SESSION 4 — STRUCTURE REVIEW (read-only)

**This session may conclude that no change is needed. That is a valid and likely outcome — say
so plainly rather than manufacturing a reorganisation.**

Assess whether the repository structure still serves a React + Vite + Supabase app of this size.
Judge separately and report separately:

- **Root and docs hygiene** — is the root cluttered with files that belong in subfolders? Are
  plan files, specs, screenshots and notes organised coherently? This is low-risk to change.
- **`src/` structure** — is `lib/` / `components/` / `pages/` still coherent at this file count?
  Are there folders that should exist (feature folders, a `hooks/` directory)? Are there files in
  the wrong place? Is any single file large enough that it should be split?

For `src/`, weigh the cost honestly: moving files rewrites every import, produces a diff touching
the whole codebase, and this project has a documented history of a merge that passed the build
and still crashed the app at runtime. **Only propose `src/` moves where the benefit is concrete
and nameable.** "Cleaner" is not a benefit. If you propose any, they must be gated behind all
PRs being merged, and staged so the build is green after each step.

Write `STRUCTURE-REVIEW.md`: your assessment first, then proposals as §3 decision blocks (`S-`),
root/docs and `src/` in clearly separate sections so the owner can approve one and refuse the
other.

---

### SESSION 5 — DOCS REWRITE

Read everything produced so far. Rewrite the project's progress and scope documentation so it
matches reality after Sessions 3 and 4.

In scope: `PROJECT-CONTEXT.md`, `PHASE-ROADMAP.md`, `CLAUDE.md`, and any plan file whose status
is now wrong.

Method — **propose before applying.** Write `DOCS-PROPOSAL.md` with `D-` decision blocks, one per
substantive change: what the document currently says, what is actually true, what you propose it
should say, and the evidence from `DISCREPANCIES.md`. Structural proposals (splitting a file,
adding an open-questions register, changing the status model) each get their own block.

Only after the owner marks decisions do you edit the documents.

Specific requirements:

- **Preserve §7 of `PROJECT-CONTEXT.md` per ground rule 5.** Reorganise and clarify freely; never
  drop or reverse a decision. Mark obsolete entries superseded, with what replaced them.
- Status must have **one** home. Today it is duplicated across `PROJECT-CONTEXT.md` §6, the
  roadmap, and plan files, and these already contradict each other. Propose a single source and
  make everything else point at it.
- Create an **open-questions register** collecting every unresolved question currently scattered
  through the docs, each with context and what answering it unblocks.
- Every status claim must be evidence-backed. If you cannot verify whether something shipped,
  write that it is unverified rather than guessing.
- Keep the reading-order discipline the project already has: a new session should be able to read
  one file and be oriented.

---

### SESSION 6 — QUESTIONNAIRE

Read everything. Produce `QUESTIONNAIRE.md` per the separate specification in
`docs/audit/QUESTIONNAIRE-SPEC.md`, which defines required coverage, question format,
prioritisation and volume.

This is the session where thoroughness matters most. A question not asked becomes an assumption
made later, and assumptions in this project have historically been expensive.

---

## 5. Session handoff

Every session ends by appending to `docs/audit/PROGRESS.md`:

- Session number, date, model used.
- What was produced, with file paths.
- What was skipped or left incomplete, and why.
- Anything the next session must know that is not already in an artefact.
- Explicitly: what the owner must do before the next session can run.

Append, never rewrite. If a session dies mid-way, append what was completed so the next one can
resume without redoing work. Write progress as you go, not only at the end — a session that runs
out of context before writing its journal has lost everything it learned.

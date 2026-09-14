# PROGRESS.md — audit operation journal

> Append-only. Every session appends a block. Never rewrite an earlier block.

---

## Session 1 — AUDIT (read-only) — COMPLETE

- **Date:** 2026-09-04
- **Model:** Claude Opus 5 (`claude-opus-5`)
- **Scope:** read-only. Nothing was modified, staged, committed or deleted outside `docs/audit/`.

### Produced

| File | Contents |
|---|---|
| `docs/audit/INVENTORY.md` | The factual map: git state (§1, incl. the Session-2 gate), dependencies (§2), file tree with line counts (§3), routes (§4), every component (§5), every `src/lib/` module with exports and purity/test/`now` status (§6), rule-compliance greps with `file:line` hits (§7), all TODO/KNOWN markers verbatim (§8), migrations (§9), tests (§10), build/lint health (§11), the live-DB gap (§12), `DESIGN-SPEC.md` sections + verbatim token tables (§13), every `.md` (§14), `.claude/` config (§15), the gate (§16). |
| `docs/audit/UNDERSTANDING.md` | The reasoned map: what the app is from the code (§1), the complete money lifecycle incl. a table of all 10 write paths (§2), subsystems (§3), the data model incl. dead/vestigial parts (§4), theming (§5), testing strategy (§6), half-built and self-inconsistent areas (§7), what is risky for an autonomous agent (§8), what surprised me (§9). |
| `docs/audit/DISCREPANCIES.md` | 21 recorded discrepancies — 6 High, 8 Medium, 7 Low — plus a list of 11 documented claims that were tested and **hold**, so later sessions do not re-check them. |

### Method notes

- Working tree audited: local `b/csv-import` @ `c457b83`, byte-identical to `origin/main` @
  `aaeb44e` (verified with `git diff --stat origin/main -- .`, empty). So findings describe `main`.
- `git fetch origin --prune` was run at the start (read-only, permitted). **It changed local ref
  state:** `origin/b/csv-import` was pruned (PR #18 merged server-side) and `origin/main` advanced
  `919a71d → aaeb44e`. Local `main` is now 3 behind. No working-tree change.
- `npm test`, `npm run build` and `npm run lint` were all executed; counts in `INVENTORY.md` §10–11
  are real, not quoted from docs.

### Skipped / incomplete, and why

1. **Live-database schema verification — NOT DONE.** The `plugin:supabase:supabase` MCP starts each
   session unauthenticated. The OAuth flow was initiated but the user had not completed it before
   the session's work concluded, so **no query ran against project `duyttdjfvblhhjihybal`**. Every
   schema statement in the artefacts is sourced from `supabase/migrations/*.sql` and from code.
   Three questions are left open by this and are marked ⚠ NEEDS LIVE DB in `DISCREPANCIES.md`:
   - **D-01** — are `recurring_import_links` and `monthly_balance_snapshots` actually applied?
     (§4 of `PROJECT-CONTEXT.md` says no, §6 of the same file says yes.)
   - **D-20** — does `budget_allocations` still exist? No code in `src/` reads or writes it.
   - Does `unallocated_pending_conflicts` exist with the shape `unallocatedPlans.js:103` writes?
   - Does `wallets.cap_reduction_enabled` still exist (documented dead)?
2. ~~**`npm audit` — NOT RUN.** Timed out at the 120 s Bash cap.~~ **RESOLVED 2026-09-07** — it
   simply needed longer than the default Bash timeout; re-run in the background it completed
   cleanly. Results folded into `INVENTORY.md` §2. Headline: 10 vulnerabilities (1 critical, 6
   high, 2 moderate, 1 low), and the critical one traces entirely to `sql@0.78.0` → `lodash@4.1.0`
   — `sql` being one of the four dependencies with zero usage in `src/`. `PROJECT-CONTEXT.md` §8's
   claim that "a couple of vulnerabilities exist" is now verified and is an undercount.
3. **GitHub MCP unavailable** (`400: Authorization header is badly formatted`) and **Playwright MCP
   unavailable** (`CONNECT_TIMEOUT`). The `gh` CLI substituted for the former and produced the full
   PR table; no browser work was needed, so this cost nothing.
4. **Binary assets not opened**, per the brief — 30 PNGs under `docs/`, `Cursus/financieel-course.pdf`,
   `public/*.svg`, `src/assets/*`. Their existence, paths and sizes are recorded.
5. **`node_modules/`, `dist/`, `screens/`, `.playwright-mcp/` not read**, per the brief. Their
   presence and item counts are recorded in `INVENTORY.md` §3.

### Things the next session must know that are not in an artefact

- **Do not re-run `git fetch --prune` expecting the same starting state** — this session already
  consumed the `origin/main` advance and the branch prune. `git branch -vv` now shows three
  `[gone]` branches that were not marked gone before.
- **`PHASE-ROADMAP.md` and `docs/dashboard-recon.md` are untracked**, and `docs/audit/` is now a
  third untracked path. Session 2's rule "never propose deleting any file with uncommitted changes"
  needs to account for all three.
- The `.claude/` hooks are live: a **PreToolUse Bash guard** blocks force-push / push-to-main /
  recursive force-delete / `npm audit fix --force` / destructive SQL, and a **Stop hook runs
  `npm test`** at session end. A blocked Bash command is the guard, not a flake.
- `.claude/settings.local.json` exists but is ignored by the user's **global** gitignore
  (`~/.config/git/ignore`), not by the repo's `.gitignore` — worth knowing before concluding a file
  is untracked "because the repo ignores it".
- **`docs/audit/AUDIT-BRIEF-ADDENDUM.md` appeared during this session** (127 lines, written
  2026-09-04 10:34, after Session 1 had started). It was read. It states "**Applies from SESSION 2
  onward. Session 1 is unaffected**", and nothing in it changes what Session 1 produced, so no
  artefact here was revised for it. **Session 2 onward must read it alongside `AUDIT-BRIEF.md`**:
  it amends Session 4's stance to a default verdict of "no change needed", and adds a requirement
  that every decision file ship with a self-contained offline HTML review interface plus a
  JSON-export write-back loop.
  Its own instruction — "Add this line to `AUDIT-BRIEF.md` §3: *See also
  AUDIT-BRIEF-ADDENDUM.md — required*" — was **not carried out**, because ground rule 1 forbids
  Session 1 from modifying anything but its own named artefacts, and `AUDIT-BRIEF.md` is not one of
  them. That edit is outstanding; the owner or Session 2 should make it.

---

## Owner decisions — 2026-09-07

Recorded verbatim so later sessions do not re-ask.

1. **`b/budgeting-performance` and `b/privacy-mode`: KEEP AS IS for now.** Owner: *"keep 2 unmerged
   branches as it is for now, we will [deal] with this later when discussing the scope etc. to
   decide what stays and what goes."* This satisfies the Session-2 prerequisite — the brief's rule
   is "stop **if** the owner has not said otherwise", and the owner has now said otherwise.
   **Session 2 may proceed.** Neither branch is to be merged, rebased, pushed or deleted by any
   session; the decision is deferred to the scope discussion.
2. **`AUDIT-BRIEF.md` §3 cross-reference to the addendum: DONE** (2026-09-07, at the owner's
   explicit instruction — the only edit any session has made outside its own named artefacts).
3. **`npm audit`: run.** See `INVENTORY.md` §2.
4. **Supabase MCP: still broken.** The `Unrecognized client_id` fix has not been applied; the
   credentials file is unchanged (verified 2026-09-07: still 4 `mcpOAuth` entries, no backup
   present). Blocks Sessions 5–6 (discrepancy D-01), not Session 2.

---

## ⛔ GATE — the owner must act before Session 2 runs

Per the brief, Session 2 must stop rather than propose deletions while the git picture is
unresolved. Reading `INVENTORY.md` §1 and deciding the following is the gate:

1. **There are zero open PRs.** All 18 are merged. That half of the gate is already clear.
2. **`b/budgeting-performance` carries ~1,300 lines of unmerged, unpushed work** — Budgeting
   Phase C: a new pure lib (`src/lib/budgetPerformance.js`, 213 lines) with 268 lines of tests,
   four new components, a new `budgeting-phase-C.md`, and edits to `DESIGN-SPEC.md`,
   `budgeting-page-plan.md`, `docs/testing-notes.md` and `PROJECT-CONTEXT.md`. It is **6 commits
   behind `origin/main`**, so landing it needs a rebase/merge, not a push. **Land it, park it, or
   abandon it?** Its `PROJECT-CONTEXT.md` edit will collide with whatever Session 5 writes.
3. **`b/privacy-mode`** is 24 behind / 3 ahead but its content is already on `main` under different
   SHAs. Delete it, or keep it?
4. **Three `[gone]` merged leftovers** — `b/budgeting-rework`, `b/csv-import`, `b/pdf-import`.
   Delete? (`b/csv-import` is the currently checked-out branch, so switching off it comes first.)
5. **Local `main` is 3 behind `origin/main`** and wants `git switch main && git pull --ff-only`.
6. **Commit or leave untracked:** `PHASE-ROADMAP.md`, `docs/dashboard-recon.md`, and `docs/audit/`.
7. **Optional but recommended:** authenticate the Supabase MCP at the start of the next session so
   the four open schema questions above can be settled. Sessions 5 and 6 will otherwise inherit
   D-01 unresolved, and D-01 is a direct self-contradiction inside `PROJECT-CONTEXT.md` §4 vs §6.

---

## Session 2 — CLEANUP PROPOSAL (read-only) — COMPLETE

- **Date:** 2026-09-13
- **Model:** Claude Opus 5 (`claude-opus-5`)
- **Branch:** `b/audit-cleanup`, cut from `origin/main` (`aaeb44e`)
- **Prerequisite satisfied:** zero open PRs, and the owner's 2026-09-07 decision on the two
  unmerged branches (recorded above) supplies the "owner has said otherwise" the brief requires.

### Housekeeping performed first (owner-approved 2026-09-13)

- `git fetch origin --prune`; local `main` fast-forwarded `919a71d → aaeb44e`.
- Deleted three fully-merged leftover branches with `git branch -d` (safe mode — each was
  verified merged before deletion): `b/budgeting-rework`, `b/csv-import`, `b/pdf-import`.
  **`b/budgeting-performance` and `b/privacy-mode` were not touched**, per the standing decision.
- Created `b/audit-cleanup` from `origin/main` and committed the three previously-untracked paths:
  - `7409024` — `docs/audit/` (brief, addendum, questionnaire spec, Session 1 artefacts, journal)
  - `bc6aca4` — `PHASE-ROADMAP.md` and `docs/dashboard-recon.md`, committed as-is with their
    staleness documented in the commit message
- Working tree clean afterwards. This means all three are now **in scope** for cleanup, which is
  why C-009 and C-016 could be written at all.

### Produced

| File | Contents |
|---|---|
| `docs/audit/CLEANUP-PROPOSAL.md` | 21 decision blocks, C-001 … C-021, in six categories, ordered safest-first. 13 DELETE, 5 ARCHIVE, 3 KEEP-BUT-FLAG. Opens with a one-screen summary and names the three highest-risk proposals; closes with §7, the four things swept for that produced nothing. |
| `docs/audit/cleanup-review.html` | The review interface required by `AUDIT-BRIEF-ADDENDUM.md` §2. Single file, zero network references (verified), all 21 blocks embedded verbatim as JSON, `localStorage` autosave under key `financieel-audit-cleanup-v1`, Export → `cleanup-decisions.json`, clipboard fallback, JSON import, keyboard-first (`j`/`k`, `1`/`2`/`3`/`0`, `/`, Enter, Esc), undecided filter, light + dark from the real `DESIGN-SPEC.md` §2 tokens. |

### Verification actually performed

- Every candidate's basename was grepped across the repo; the result is stated in its block.
  Several proposals were **narrowed** by what the greps returned — see below.
- The HTML was served locally and driven in a real browser: page renders, **zero console errors**
  (the single 404 was my throwaway server's missing `favicon.ico`, not the page), keyboard
  decisions set state and auto-advance, counters and progress bar update, autosave fires.
  The embedded JSON was separately parsed with `node`: 21 blocks, no duplicate ids, no block
  missing a required field, action counts match the markdown summary table exactly.
- Test state from that run lives under origin `http://localhost:8321`, which is a different
  origin from the `file://` the owner will open — so the interface opens empty for them.

### Judgement calls worth knowing about

1. **`screens/` was nearly mis-swept.** The obvious move was "delete the three gitignored artifact
   directories". `docs/dashboard-recon.md:6` and its §4 cite **nine** screenshots in `screens/`
   root by name as the evidence base for the not-yet-started Phase 2 dashboard rebuild, and the
   folder is gitignored, so deletion would be permanent. C-008 is therefore scoped to the two
   subfolders only, and C-009 exists purely to flag the nine as load-bearing.
2. **Four root plan files are deliberately not proposed.** `pdf-import-plan.md`,
   `kbc-adapter-spec.md`, `kbc-csv-import-background.md` and `budgeting-page-plan.md` are cited
   from *source-code comments* as living specifications (e.g. `dedupe.js` → "pdf-import-plan.md §7",
   `resolveCappedInflow.js` → "budgeting-page-plan.md §4.2"). They are reference documents, not
   consumed prompts.
3. **`docs/wallets.png`, `docs/income.png`, `docs/settings.png` are protected by proxy** —
   `DESIGN-SPEC.md:183` cites all three as the owner-approved mockups. Only the three
   `*_straightFromClaudeInterface.png` siblings are proposed (C-012), and that block says so.
4. **§6 is dependency edits, not file deletions**, so it sits last. C-018 (`sql`) is the highest-
   value block in the file: removing one unused line eliminates the project's only **critical**
   vulnerability, because `sql@0.78.0` is the sole parent of `lodash@4.1.0`.

### Skipped / not done

- **Live-DB verification still not performed.** A fresh OAuth URL was generated this session
  (new `client_id` — the stale registration that caused `Unrecognized client_id` was purged on
  2026-09-07 and the credentials backup sits at `~/.claude/.credentials.json.bak-20260907`). The
  owner has not yet completed the browser consent step. **Does not affect Session 2 or 3**; blocks
  Sessions 5–6 via discrepancy D-01.
- **Nothing was deleted, moved or archived.** Session 2 is read-only; execution is Session 3's job
  and only for blocks marked `ok`.
- **Minor:** the browser verification added files to `.playwright-mcp/`, so C-007's stated count
  (101 files, 1.9 MB) is now a slight undercount. The proposal is unaffected — the whole directory
  is the candidate.

### What the owner must do before Session 3 runs

1. **Decide the 21 blocks.** Either open `docs/audit/cleanup-review.html` (double-click), work
   through them, click **Export**, and move `cleanup-decisions.json` into `docs/audit/` — or edit
   `DECISION:` fields directly in `CLEANUP-PROPOSAL.md`. Both are valid; the JSON is what Session 3
   parses if it is present.
2. Partial is fine. Export halfway and Session 3 will execute what is decided and report the rest
   as skipped. **Blocks left as `?` are never executed.**
3. Pay particular attention to **C-019** (`supabase` CLI — most likely to be a deliberate choice I
   cannot see from the repo) and **C-021** (the only build-config edit).

> **Supersedes "Owner decisions — 2026-09-07" item 4.** That item says the `Unrecognized client_id`
> fix "has not been applied" and the credentials file "is unchanged". It was written *before* the
> fix ran later that same day. Corrected state, verified 2026-09-13: the three stale
> `plugin:supabase:supabase|…` entries **were removed**, a backup exists at
> `~/.claude/.credentials.json.bak-20260907`, and `claudeAiOauth` plus the unrelated
> `supabase|5de00e37…` entry (a different project, `bljaqfeqkjaqvdxwbpkx`) were preserved. Only the
> browser consent step remains outstanding. Left as an append rather than an edit, per the
> append-only rule.

---

## Session 3 — CLEANUP EXECUTE — COMPLETE

- **Date:** 2026-09-14
- **Model:** Claude Opus 5 (`claude-opus-5`)
- **Branch:** `b/audit-cleanup`
- **Input:** `docs/audit/cleanup-decisions.json` (exported from the review interface,
  2026-09-14T10:06Z — 21 of 21 answered)

### Outcome: 21 executed, 0 skipped, 0 deferred

| Batch | Commit | Blocks | Action |
|---|---|---|---|
| Vite starter leftovers | `9cd6330` | C-001 … C-005 | DELETE (tracked) |
| Superseded screenshots | `d707f23` | C-010, C-011, C-012 | DELETE (tracked) — 27 files |
| Consumed plan/recon docs | `ac869eb` | C-013, C-014, C-015 | ARCHIVE → `docs/archive/` |
| Retired tombstone | `dab45fe` | C-017 | DELETE (tracked) |
| Deps + build config | `65d3674` | C-018 … C-021 | DELETE (package.json, vite.config.js) |
| Local artifact dirs | *(no commit — gitignored)* | C-006, C-007, C-008, C-009 | DELETE (disk only) |
| README | *(no file action)* | C-016 | KEEP-BUT-FLAG — recorded, rewrite is Session 5's |

### Four owner overrides honoured

`cleanup-decisions.json` carried `decision: "no"` with a contradicting note on four blocks. Per
`AUDIT-BRIEF.md` §3 ("or free text after `note:` which you must read and honour"), the note won:

| Block | Proposed | Note | Executed as |
|---|---|---|---|
| C-010 | ARCHIVE | "delete" | DELETE |
| C-011 | ARCHIVE | "delete" | DELETE |
| C-017 | KEEP-BUT-FLAG | "delete" | DELETE |
| C-009 | KEEP-BUT-FLAG | "they can be deleted" | DELETE — **confirmed with the owner before acting** |

**C-009 was escalated rather than assumed.** It was the only irreversible item (gitignored, no git
copy) and the only one whose note was permissive ("can be") rather than imperative. The owner was
shown the consequence — `docs/dashboard-recon.md` §4 cites all nine screenshots by name for the
unstarted Phase 2 rebuild — and chose permanent deletion. All of `screens/` is therefore gone.

### Verification — no regression (gates run after the dependency change)

| Gate | INVENTORY.md baseline | After cleanup | Verdict |
|---|---|---|---|
| `npm run build` | pass | pass, built in 2.79 s | ✅ |
| `npm test` | 352 passed / 24 files | 352 passed / 24 files | ✅ |
| `npm run lint` | 44 problems (33 err, 11 warn), exit 1 | 44 problems (33 err, 11 warn), exit 1 | ✅ identical |

`npm install` removed 7 packages (253 → 194). **`lodash` is gone** (`npm ls lodash` → empty),
taking the project's only critical advisory with it, and `sql`'s own moderate advisory too.

**Honest note on the audit total:** it moved 10 → 11, not down. Three dev-side advisories
(`vitest`, `@vitest/mocker`, `baseline-browser-mapping`) were published in the week between the
2026-09-07 baseline and today. Unrelated to this change. Critical is now **0**, which was the point.

### Correction to a Session 1 figure

`INVENTORY.md` §3 and `CLEANUP-PROPOSAL.md` C-010 both say `docs/redesign-screenshots/` held **14**
PNGs. It held **16** (the 30-PNG total for `docs/` was right; the split was 16/8/6, not 14/8/6).
C-010 targeted the whole folder, so the executed action was correct either way. Recorded here
rather than edited into the earlier files, per the append-only rule.

### Doc-repair debt created — all of it Session 5's, none fixed here (ground rule 8)

1. `PROJECT-CONTEXT.md:475` and `:623` cite the two deleted screenshot folders.
2. `CLAUDE.md`'s "Key references" list and `PROJECT-CONTEXT.md` §9 name
   `distribution-unallocated-plan.md` and `testing-setup-plan.md`, now under `docs/archive/`.
3. **Eight files still name the deleted `ARCHITECTURE.md`:** `CLAUDE.md`, `PROJECT-CONTEXT.md`,
   `pdf-import-plan.md`, `.claude/skills/db-migration/SKILL.md`, and four `Cursus/` chapters. Most
   are *warnings not to trust it*, so they need rewording, not a path fix.
4. `docs/dashboard-recon.md` §4 now cites nine screenshots that no longer exist anywhere.
5. `CLAUDE.md`'s first-time-setup and `PROJECT-CONTEXT.md` §2 may mention removed dependencies.

### What the owner must do before Session 5

Nothing blocking. Session 4 (structure review) is read-only and independent of all of the above.
The Supabase MCP consent step is still outstanding and still blocks Sessions 5–6 via D-01.

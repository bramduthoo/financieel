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

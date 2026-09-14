# DOCS-PROPOSAL.md — proposed documentation rewrite

> Session 5 of the audit operation, 2026-09-14, Claude Opus 5.
> **Nothing has been edited.** Per `AUDIT-BRIEF.md` §4, Session 5 proposes before applying. Every
> block below is a change I will make *only* if you mark it `ok`.
>
> **Companion interface:** `docs/audit/docs-review.html` — same contract as the previous two.
> Editing `DECISION:` here directly works just as well.

---

## ⚠ A naming collision you need to know about

`AUDIT-BRIEF.md` §3 reserves the `D-` prefix for **docs proposals**. Session 1 unknowingly used
`D-01 … D-23` for **discrepancies** in `DISCREPANCIES.md`.

To keep them apart:

- **`D-01 … D-22`** in this file = **proposal blocks** you decide on (per the brief).
- **`DISC-nn`** = a discrepancy in `DISCREPANCIES.md`, which labels it `D-nn`.

So "DISC-01" below means the entry printed as `D-01` in `DISCREPANCIES.md`. I have not renamed
anything in that file — renaming a committed artefact mid-operation would be worse than the
footnote.

---

## Summary

**22 blocks**, ordered safest-first.

| Section | Blocks | What it is |
|---|--:|---|
| §1 Path repairs from Sessions 3–4 | D-01 … D-05 | Mechanical. I created this debt; these pay it off. |
| §2 Live-DB factual corrections | D-06 … D-09 | Things the database proved wrong. |
| §3 Stale status claims | D-10 … D-13 | Shipped work documented as pending. |
| §4 Rule and tooling corrections | D-14 … D-18 | `CLAUDE.md` and `PROJECT-CONTEXT.md` claims the code contradicts. |
| §5 Structural | D-19 … D-22 | The three the brief explicitly requires, plus `README.md`. |

**Files touched if everything is approved:** `PROJECT-CONTEXT.md`, `PHASE-ROADMAP.md`,
`CLAUDE.md`, `README.md`, `docs/dashboard-recon.md`, `.claude/skills/db-migration/SKILL.md`, and
one new file (`docs/audit/OPEN-QUESTIONS.md` or equivalent — see D-20).

**The three highest-stakes blocks**

1. **D-19 — status gets one home.** The brief requires it and it is the single biggest change to
   how these documents work. It changes where you look for "what's done", permanently.
2. **D-06 — the `PROJECT-CONTEXT.md` §4 CSV heading.** The most actively harmful sentence in the
   documentation: it tells a fresh session that two tables which *do* exist do not.
3. **D-22 — how §7 is treated.** Ground rule 5 calls the decision log "the most valuable artefact
   in the repo". I propose reorganising it. Read that block carefully; refusing it costs nothing.

**Not proposed, deliberately:** anything in `Cursus/`. Four of its chapters reference the deleted
`ARCHITECTURE.md`, but the whole folder is already marked outdated-on-schema by both `CLAUDE.md`
and `PROJECT-CONTEXT.md`, and it is a frozen teaching artefact from June. Rewriting it is its own
project, not documentation maintenance.

---

# §1 — Path repairs from Sessions 3–4

I created this debt by archiving, deleting and moving files. These five blocks pay it off. All are
mechanical and verifiable by grep.

### D-01 · `CLAUDE.md` — "Key references" names four files at stale paths
**Currently says:** "`distribution-unallocated-plan.md`, `testing-setup-plan.md`,
`backup-restore-feature-plan.md`, `encryption-with-key-plan.md` — phase plans."
**Actually true:** none of those four is at that path any more. Two were archived in Session 3
(C-013/C-015) and two were moved in S-001:
`docs/archive/distribution-unallocated-plan.md`, `docs/archive/testing-setup-plan.md`,
`docs/plans/backup-restore-feature-plan.md`, `docs/plans/encryption-with-key-plan.md`.
**Proposed text:** split the line into shipped-and-archived versus live-and-planned, so the reader
learns the status from the list itself:
> - `docs/plans/backup-restore-feature-plan.md`, `docs/plans/encryption-with-key-plan.md` — plans for phases **not yet built**.
> - `docs/plans/` also holds the specs for shipped features that source code still cites: `budgeting-page-plan.md`, `pdf-import-plan.md`, `kbc-adapter-spec.md`, `kbc-csv-import-background.md`.
> - `docs/archive/` holds consumed plans kept for their reasoning, not for instruction.

**Evidence:** commits `ac869eb` (archive) and `d666165` (S-001); `git grep` for each filename.
**Proposed action:** EDIT `CLAUDE.md`
**DECISION:** ?
**Notes:**

### D-02 · `PROJECT-CONTEXT.md` §9 — companion-file list is stale, incomplete, and mislabels a finished phase
**Currently says:** six entries, with `distribution-unallocated-plan.md` described as
"finishing distribution + the Unallocated wallet **(active phase)**".
**Actually true:** three problems at once. (a) That phase is **DONE** — §5 and §6 of the same file
say so, and the code confirms it (DISC-11). (b) Every path is stale after Sessions 3–4.
(c) The list **omits `budgeting-page-plan.md`**, a 647-line spec that `CLAUDE.md` rule 7 calls
"authoritative", and omits `PHASE-ROADMAP.md` entirely (DISC-12).
**Proposed text:** rebuild §9 as a table with `File | Status | What it is`, containing every plan
file at its real path, with `budgeting-page-plan.md` and `PHASE-ROADMAP.md` added and the
"(active phase)" label removed.
**Evidence:** DISC-11, DISC-12; `docs/plans/` and `docs/archive/` listings.
**Proposed action:** REWRITE `PROJECT-CONTEXT.md` §9
**DECISION:** ?
**Notes:**

### D-03 · Three files still point at the deleted `ARCHITECTURE.md`
**Currently says:** `CLAUDE.md` — "`ARCHITECTURE.md` and `Cursus/` docs are OUTDATED on schema";
`PROJECT-CONTEXT.md` §2 — "`ARCHITECTURE.md` has been **retired to a pointer**";
`.claude/skills/db-migration/SKILL.md` — a similar warning.
**Actually true:** the file was **deleted** in Session 3 (C-017, commit `dab45fe`, your override of
my KEEP-BUT-FLAG). All three warnings now name a file that does not exist.
**Proposed text:** these are *warnings*, not paths, so the fix is rewording, not repointing. In
each, replace the filename with the substance: e.g. `CLAUDE.md` → "`Cursus/` docs are OUTDATED on
schema — never trust them. (A former `ARCHITECTURE.md` was retired and then deleted in 2026-09;
if you find a copy in git history, it is wrong.)"
**Evidence:** commit `dab45fe`; `Grep` for `ARCHITECTURE.md` → 8 files, 4 of them in `Cursus/`.
**Note:** covers the three *live* files only. The four `Cursus/` chapters are excluded by the
summary's note above.
**Proposed action:** EDIT `CLAUDE.md`, `PROJECT-CONTEXT.md` §2, `.claude/skills/db-migration/SKILL.md`
**DECISION:** ?
**Notes:**

### D-04 · Three citations point at screenshots deleted in Session 3
**Currently says:** `PROJECT-CONTEXT.md:475` cites `docs/density-screenshots/` and `:623` cites
`docs/redesign-screenshots/` as evidence that merged PRs were verified in both themes.
`docs/dashboard-recon.md` §4 cites **nine** screenshots in `/screens` by name.
**Actually true:** all are gone. The two `docs/` folders were deleted (C-010/C-011, your DELETE
override) — recoverable from git history. The nine in `/screens` were gitignored and are
**permanently gone** (C-009, confirmed with you before acting).
**Proposed text:** in `PROJECT-CONTEXT.md`, keep the verification *claim* and drop the dead path —
"verified in both themes via Playwright on the test account (screenshots deleted in the 2026-09
cleanup; see `docs/audit/PROGRESS.md`)". In `docs/dashboard-recon.md`, replace §4's list with a
short note that the visual baseline no longer exists and must be re-captured when Phase 2 starts.
**Evidence:** commits `d707f23`, and the Session 3 journal entry for C-009.
**Why this one matters more than it looks:** `dashboard-recon.md` is the input document for a phase
that has not started. Leaving it citing nine missing files means whoever picks up Phase 2 spends
their first twenty minutes hunting for them.
**Proposed action:** EDIT `PROJECT-CONTEXT.md` §6, `docs/dashboard-recon.md` §4
**DECISION:** ?
**Notes:**

### D-05 · `CLAUDE.md` rule 7 and `PHASE-ROADMAP.md` cite moved spec files
**Currently says:** `CLAUDE.md` rule 7 — "See `budgeting-page-plan.md` §4 (authoritative)";
`PHASE-ROADMAP.md` Phase 3 — "Output: `pdf-import-plan.md`", and Phases 4/5 name
`backup-restore-feature-plan.md` and `encryption-with-key-plan.md`.
**Actually true:** all four now live under `docs/plans/` (S-001, commit `d666165`).
**Proposed text:** prefix each with `docs/plans/`.
**Evidence:** commit `d666165`.
**Note:** the ~15 citations inside *source-code comments* are deliberately **not** touched. They
cite bare filenames (e.g. `// … (budgeting-page-plan.md §4.2)`), which stay greppable after a move.
Editing working code to fix a comment path is out of scope and invites diff noise in money code.
**Proposed action:** EDIT `CLAUDE.md`, `PHASE-ROADMAP.md`
**DECISION:** ?
**Notes:**

---

# §2 — Live-DB factual corrections

Each of these was settled by a read-only query on 2026-09-14 (`DISCREPANCIES.md` → Live-DB
verification).

### D-06 · `PROJECT-CONTEXT.md` §4 says the CSV-import tables are not applied. They are.
**Currently says:** §4 heading — "**CSV-import tables (DRAFTED 2026-07-30 — NOT applied yet**,
`supabase/migrations/20260730120000_csv_import_schema.sql`)", followed by "Until then the Import
page degrades visibly ('reduced checks' banner) and the recurring/snapshot writes are skipped."
**Actually true:** both `recurring_import_links` and `monthly_balance_snapshots` **exist in the
live database.** The migration was applied. §6 of the same file has said so since `c457b83`; §4 was
simply never updated, so the document contradicts itself (DISC-01).
**Proposed text:** replace the heading with "**CSV-import tables (applied 2026-07-30, verified live
2026-09-14)**" and delete the "Until then…" sentence entirely — it describes a degraded state that
no longer exists. Add the row counts (both 0) so the next reader knows the tables are live but
unused because the first real import has not happened.
**Evidence:** `select table_name from information_schema.tables where table_schema='public'` —
both present; DISC-01 resolution.
**Why this is the highest-priority block in the file:** §4 is where a new session goes to learn the
schema. Acting on the current text means believing two live tables do not exist — and the natural
"fix" would be to re-apply a migration that has already run.
**Proposed action:** REWRITE `PROJECT-CONTEXT.md` §4 CSV subsection
**DECISION:** ?
**Notes:**

### D-07 · §4 preamble undercounts the migration folder
**Currently says:** "**Five files exist today**: `reset_user_data`, `wallets_cap_max_gte_budget`,
`income_recurring_include_in_budget`, and the two PDF-import ones."
**Actually true:** **six** — the list omits `20260730120000_csv_import_schema.sql`, committed in
`3745134`. Same blind spot as D-06: both undercount the CSV work (DISC-06).
**Proposed text:** "Six files exist today", with the CSV migration added to the list.
**Evidence:** `ls supabase/migrations/` → 6 files.
**Proposed action:** EDIT `PROJECT-CONTEXT.md` §4 preamble
**DECISION:** ?
**Notes:**

### D-08 · §4 never documents `unallocated_pending_conflicts` as a table
**Currently says:** nothing. The table appears only inside the prose of `reset_user_data`'s delete
list (line 271), never as an entry with its columns.
**Actually true:** it exists with `id`, `user_id` NOT NULL, `balance_snapshot` numeric NOT NULL,
`eligible_plan_ids` ARRAY NOT NULL, `status` text NOT NULL, `chosen_plan_id`, `resolved_at`,
`created_at` — exactly what `src/lib/unallocatedPlans.js:103` writes. It drives the entire
multi-plan conflict stall, which `UNDERSTANDING.md` §2.5 calls the most interesting design decision
in the app (DISC-20).
**Proposed text:** add it to §4's Distribution tables group with its full column list and a
one-line statement of purpose: a persisted refusal to guess when two plans are simultaneously
eligible.
**Evidence:** `information_schema.columns`; `src/lib/unallocatedPlans.js:103`,
`src/components/UnallocatedConflictBanner.jsx:61,65,77`.
**Proposed action:** ADD to `PROJECT-CONTEXT.md` §4
**DECISION:** ?
**Notes:**

### D-09 · §4 does not distinguish live columns from vestigial ones
**Currently says:** §4 lists `settings` as carrying "currency, currency_symbol, month_start_day,
theme, strict_distribution, bank_provider" as though all are live. `budget_allocations` appears as
a core table described only as "user_id". `cap_reduction_enabled` **is** correctly flagged DEAD.
**Actually true:** three columns and one table are confirmed vestigial by the live DB:

| Thing | Status |
|---|---|
| `settings.currency`, `settings.currency_symbol` | Exist; currency picker reverted in `c6e4f15`; app is hard-coded EUR in `format.js`. Read by nothing (DISC-22) |
| `settings.hide_balances` | **Does not exist** — privacy mode is session-only (DISC-23) |
| `budget_allocations` | Exists, full shape, **0 rows**, no code reads or writes it (DISC-20) |
| `wallets.cap_reduction_enabled` | Exists, non-null on all 18 wallets, read by nothing — already documented correctly |

**Proposed text:** introduce a consistent **`VESTIGIAL —`** marker in §4 and apply it to all four,
matching the treatment `cap_reduction_enabled` already gets. Explicitly note that
`hide_balances` does *not* exist and must never be created (see D-16).
**Evidence:** live-DB verification section of `DISCREPANCIES.md`.
**Why it matters:** an undocumented dead column is worse than a documented one — someone sees
`settings.currency` and concludes a currency feature half-exists and just needs wiring up.
**Proposed action:** EDIT `PROJECT-CONTEXT.md` §4
**DECISION:** ?
**Notes:**

---

# §3 — Stale status claims

### D-10 · Privacy mode is documented as unbuilt in two places. It shipped in July.
**Currently says:** `PROJECT-CONTEXT.md` §6 — "Privacy mode (hide balances) … **Still unbuilt —
pick it up any time.**" `PHASE-ROADMAP.md:18` — "Phase 1 — Privacy mode (small follow-up) —
CODE-FIRST" presented as the next phase, with a kickoff prompt instructing "Add a `hide_balances`
boolean to settings (draft migration per db-migration skill — STOP for the owner to apply)".
**Actually true:** shipped in **PR #10, merged 2026-07-13**. `src/lib/PrivacyContext.jsx` exists,
`formatMoney()` masks to `€ ••••`, `App.jsx:32-35` wires it, `Layout.jsx` toggles it, 15 tests
cover it. **And it shipped deliberately differently from the plan:** session-only, no DB column —
`format.js:12-16` says "Session-only … Resets to visible on reload by design", and the live DB
confirms `settings.hide_balances` does not exist (DISC-02, DISC-23).
**Proposed text:** in §6, move it from "DEFERRED" to the shipped list with its PR number and the
session-only design note. In `PHASE-ROADMAP.md`, **delete Phase 1 entirely** and record it in the
shipped history (see D-19), with an explicit warning that the `hide_balances` migration in its old
kickoff prompt must never be written.
**Evidence:** `gh pr list` → #10 MERGED; the source files above; live-DB column check.
**Why the warning matters:** that kickoff prompt is a loaded gun. Anyone following it would add a
column the app does not use and cannot read.
**Proposed action:** EDIT `PROJECT-CONTEXT.md` §6; DELETE `PHASE-ROADMAP.md` Phase 1
**DECISION:** ?
**Notes:**

### D-11 · Two merged PRs are described as open
**Currently says:** §6 — "KBC monthly CSV import — DONE, **PR #18 open**" and the density pass
"(branch `b/density-pass`, 2026-07-14; **PR open**)".
**Actually true:** PR #18 merged 2026-07-30, PR #11 merged 2026-07-13. **All 18 PRs the repository
has ever had are merged; there are zero open PRs** (DISC-07).
**Proposed text:** "merged as PR #18, 2026-07-30" / "merged as PR #11, 2026-07-13". Also correct
the density-pass date — §6 says 2026-07-14 but the PR merged 2026-07-13.
**Evidence:** `gh pr list --state all --limit 25`.
**Proposed action:** EDIT `PROJECT-CONTEXT.md` §6
**DECISION:** ?
**Notes:**

### D-12 · `PHASE-ROADMAP.md` Phase 3 presents a shipped subsystem as an open design question
**Currently says:** Phase 3 (PDF transaction import) is listed as upcoming CHAT-FIRST work, with
its two gating design questions still open — "Parsing approach: deterministic parser per bank
format vs Claude API extraction … vs hybrid" — plus a kickoff prompt.
**Actually true:** shipped in **PR #17, merged 2026-07-26**, as a deterministic parser. 15 modules
in `src/lib/import/`, ~200 tests, two migrations applied. The decision the roadmap poses as open
was made and executed two months ago (DISC-08).
**Proposed text:** delete Phase 3 from the roadmap and record it in the shipped history (D-19),
noting the resolved decision: deterministic parser, no AI extraction, because statements are
sensitive.
**Evidence:** `gh pr list` → #17 MERGED; `src/lib/import/` (15 modules); `docs/plans/pdf-import-plan.md`.
**Proposed action:** DELETE `PHASE-ROADMAP.md` Phase 3
**DECISION:** ?
**Notes:**

### D-13 · The Budgeting feature does not appear in the roadmap at all
**Currently says:** `PHASE-ROADMAP.md` describes itself as "remaining phases, in order" and lists
five. Budgeting is not among them, before or after.
**Actually true:** Budgeting Phases A, B, B2-1 and B2-2 shipped across **PRs #14, #15 and #16**
between 2026-07-17 and 2026-07-21, adding the `/budgeting` route, `src/lib/budgetPlan.js`,
`src/lib/budgetFlowLayout.js`, `src/components/budgeting/` and two migrations. **Phase C exists but
is unmerged** on `b/budgeting-performance` (DISC-09).
**Proposed text:** add Budgeting A/B/B2 to the shipped history (D-19), and add **Phase C as an
explicit open item** — not as a roadmap phase, but as a decision pending in the open-questions
register (D-20): land it, or abandon it.
**Evidence:** `gh pr list`; `docs/plans/budgeting-page-plan.md`; `git log origin/main..b/budgeting-performance`.
**Why it matters:** the roadmap is the document you hand a fresh chat to say "here is what's left".
Today it would tell that chat to build privacy mode and PDF import, and would not mention that a
finished 1,300-line feature is sitting unmerged on a local branch.
**Proposed action:** EDIT `PHASE-ROADMAP.md`
**DECISION:** ?
**Notes:**

---

# §4 — Rule and tooling corrections

### D-14 · `CLAUDE.md` lists `npm run lint` as a normal command. It fails.
**Currently says:** "Lint: `npm run lint` (ESLint flat config, `eslint.config.js`)" — presented
alongside build and test as though it passes.
**Actually true:** exits **1**, with **44 problems (33 errors, 11 warnings)** across 19 files —
including 11 `react-hooks/static-components` ("Cannot create components during render"), which is a
real re-mount bug class rather than a style nit. CI runs `npm test` **only**, so nothing catches
regression. `PROJECT-CONTEXT.md` §6 normalises the number ("44 pre-existing problems, 0 new")
rather than recording that the command is red (DISC-03).
**Proposed text:** "Lint: `npm run lint` — **currently fails**: 44 pre-existing problems (33
errors, 11 warnings) as of 2026-09-14. Treat the count as the baseline; your change should not
raise it. CI does not run lint."
**Evidence:** `npm run lint` run in Sessions 1 and 3; `.github/workflows/test.yml`.
**Deliberately not proposed:** fixing the 44. That is code work with its own approval
(ground rule 8).
**Proposed action:** EDIT `CLAUDE.md`
**DECISION:** ?
**Notes:**

### D-15 · `CLAUDE.md` says the reskin covers the whole app. One file was missed.
**Currently says:** "**Reskin rollout is complete** (R1 + R2): the whole app uses the tokens."
**Actually true:** every file in `src/` uses only token utilities **except `src/App.jsx`**, which
carries four raw Tailwind palette classes — `bg-gray-50 dark:bg-gray-950` and `text-gray-400` on
the loading screen (lines 71-72), and `bg-green-500 text-white` on the signup welcome banner (line
84). These are the first two views a new user sees, and both ignore the theme (DISC-05).
**Proposed text:** "Reskin rollout is complete (R1 + R2) **with one known exception**: `src/App.jsx`
still uses raw Tailwind palette classes in the pre-session loading screen and the welcome banner.
Everything else uses the tokens."
**Evidence:** `git grep -lE "(bg|text|border)-(gray|slate|…)-[0-9]+" -- src` → `src/App.jsx` only.
**Deliberately not proposed:** fixing `App.jsx`. It is a four-line code change, but it is still a
code change (ground rule 8). It belongs in the open-questions register (D-20) as a known cheap fix.
**Proposed action:** EDIT `CLAUDE.md`
**DECISION:** ?
**Notes:**

### D-16 · `CLAUDE.md` describes a two-person workflow with no second person
**Currently says:** "Two-person project: Bram (`b/` branches) and Wouter (`f/` branches)", and a
first-time-setup section addressed to "collaborators".
**Actually true:** **no `f/` branch has ever existed** (`git branch -a --list "*f/*"` → empty). The
only Wouter-authored ref is `origin/WOUTER`, last commit 2026-06-24, now 67 behind `origin/main`
and 0 ahead. `woholvoe` has 6 of 86 commits on `main`, none since June (DISC-14).
**Proposed text:** I do not know whether this is still a two-person project — that is a fact about
your life, not the repo. **Two options; pick one in the Notes:**
> **(a)** Keep the two-person framing, and correct only the branch convention: note that the `f/`
> prefix was never used and `origin/WOUTER` is a stale fully-merged branch.
> **(b)** Make it single-maintainer: drop the `f/` convention, and move the first-time-setup
> section from "for collaborators" to "for a new machine".

**Evidence:** `git branch -a`, `git log --format=%an origin/main | sort | uniq -c`.
**Proposed action:** EDIT `CLAUDE.md` — **option (a) or (b), your call**
**DECISION:** ?
**Notes:**

### D-17 · Two tooling-status claims are out of date
**Currently says:** `CLAUDE.md` first-time-setup — "install the official plugins once (`context7`,
`supabase`, `playwright`, `github`)". `PROJECT-CONTEXT.md` §3 — "**GitHub connector: NOT
connected**, the owner couldn't find it in the connector list."
**Actually true:** `.claude/settings.json` enables **seven** plugins — those four plus
`frontend-design`, `code-review` and `typescript-lsp`. A collaborator following `CLAUDE.md`
installs four and gets three silent no-ops. And the GitHub connector *is* enabled; it failed to
connect in these sessions with `400: Authorization header is badly formatted`, which is an auth
fault, not absence. The §3 text also never says whether it describes the chat assistant's connector
or Claude Code's plugin, so a reader applies it to the wrong one (DISC-15, DISC-16).
**Proposed text:** list all seven plugins in `CLAUDE.md`. In §3, label the subsection "Chat
assistant connectors" and add a Claude Code line noting the plugin is enabled but has been failing
auth, with `gh` CLI as the working fallback.
**Evidence:** `.claude/settings.json`; this session's MCP connection errors; `gh auth status`.
**Proposed action:** EDIT `CLAUDE.md`, `PROJECT-CONTEXT.md` §3
**DECISION:** ?
**Notes:**

### D-18 · `PROJECT-CONTEXT.md` §8's dependency-security note is now both stale and an undercount
**Currently says:** "**npm audit:** a couple of vulnerabilities exist; do NOT `npm audit fix
--force` casually (can break the build)."
**Actually true:** when finally measured on 2026-09-07 it was **10 vulnerabilities, 1 of them
critical** — not "a couple". The critical one traced entirely to the unused `sql` dependency, whose
sole purpose was dragging in `lodash@4.1.0`. **Session 3 removed it** (C-018), along with
`supabase`, `path-key` and `react-is`, so the current state is **0 critical**.
**Proposed text:** "**Dependency security:** four unused dependencies were removed in the 2026-09
cleanup (`sql`, `supabase`, `path-key`, `react-is`), eliminating the only critical advisory —
`sql` was the sole parent of `lodash@4.1.0`. `pdfjs-dist` remains the one genuinely-used direct
dependency with an open advisory (high; fix is a non-major bump). Still never run `npm audit fix
--force` — the Bash guard blocks it."
**Evidence:** `npm audit` 2026-09-07 and post-cleanup; `npm ls lodash` → empty; commit `65d3674`.
**Proposed action:** EDIT `PROJECT-CONTEXT.md` §8
**DECISION:** ?
**Notes:**

---

# §5 — Structural

The first three are required by `AUDIT-BRIEF.md` §4. The fourth is the `README.md` flagged in
Session 2 as C-016.

### D-19 · Status gets ONE home — `PROJECT-CONTEXT.md` §6 — and everything else points at it
**The brief's requirement, verbatim:** "Status must have **one** home. Today it is duplicated
across `PROJECT-CONTEXT.md` §6, the roadmap, and plan files, and these already contradict each
other. Propose a single source and make everything else point at it."

**Currently:** status lives in at least four places, and they disagree. §6 says privacy mode is
unbuilt while `PHASE-ROADMAP.md` schedules it as Phase 1 and the code has shipped it. §4 says the
CSV tables are not applied while §6 says they are. `docs/plans/distribution-unallocated-plan.md`
declared itself "the ACTIVE phase" for two months after finishing.

**Proposed:**
1. **`PROJECT-CONTEXT.md` §6 becomes the only place a status is asserted.** It gets two
   subsections: **Shipped** (reverse-chronological, every entry carrying its PR number and merge
   date) and **In flight / undecided** (anything not merged, each pointing at the open-questions
   register).
2. **`PHASE-ROADMAP.md` stops carrying status.** It becomes purely forward-looking: *how to start
   the phases that have not started*. Shipped phases are deleted from it, not annotated. It opens
   with one line: "Status lives in `PROJECT-CONTEXT.md` §6. This file only covers work that has not
   started."
3. **Plan files stop asserting status.** Each gets a one-line header stamp —
   `> Status: see PROJECT-CONTEXT.md §6.` — replacing self-descriptions like "the ACTIVE phase".
4. **Every status claim in §6 carries evidence** — a PR number, a merge date, or the word
   **UNVERIFIED**. Per the brief, where I cannot confirm something shipped, it says so rather than
   guessing.

**Why this shape:** the roadmap and the plan files are the documents that go stale, because they
are written *before* the work and rarely revisited after. §6 is the one already updated at the end
of each session by the `wrapup` skill. Putting status where the habit already exists is more
durable than a new convention.

**Cost:** `PHASE-ROADMAP.md` loses roughly half its content (Phases 1 and 3 deleted outright), and
six plan files gain a header line. If you refuse this block, D-10, D-12 and D-13 still make sense
individually — they would just annotate the roadmap in place instead of deleting from it.
**Proposed action:** RESTRUCTURE `PROJECT-CONTEXT.md` §6 + `PHASE-ROADMAP.md` + 6 plan-file headers
**DECISION:** ?
**Notes:**

### D-20 · Create an open-questions register
**The brief's requirement, verbatim:** "Create an **open-questions register** collecting every
unresolved question currently scattered through the docs, each with context and what answering it
unblocks."

**Currently:** unresolved questions are scattered and several are buried mid-paragraph in §4 and
§6, where they read as commentary rather than as things awaiting a decision.

**Proposed:** a new file — **`OPEN-QUESTIONS.md`** in the repo root, or `docs/OPEN-QUESTIONS.md`
(say which in Notes; I lean root, next to `PHASE-ROADMAP.md`, since it is a thing you act on) —
with one row per question: *question · context · what answering it unblocks · raised by*.

Seeded with everything found in this audit:

| # | Question | Unblocks |
|---|---|---|
| 1 | **`b/budgeting-performance`: land it or abandon it?** ~1,300 lines of finished Phase C, unpushed, 6 commits behind `origin/main`. | The Budgeting feature's completion; the rebase cost grows as `main` moves. |
| 2 | **`b/privacy-mode`: delete it?** 3 commits ahead, 24 behind; content already on `main` under different SHAs. | Branch hygiene only. |
| 3 | **Should `transactions_import_fingerprint_idx` become UNIQUE?** Today non-unique, so cross-import dedupe is client-side only — a double-submit or a stale second tab could insert the same bank transaction twice. 0 imported rows today, so nothing can conflict yet. *(Raised in §6; the most consequential item here.)* | DB-enforced import dedupe. Needs a migration via the `db-migration` skill. |
| 4 | **Should `reset_user_data(p_full)` clear the import tables?** Links cascade away with their rules; `monthly_balance_snapshots` survives a full reset. *(Raised in §4.)* | Whether "full reset" means what the UI implies. |
| 5 | **Is this still a two-person project?** (see D-16) | The `f/` branch convention and who `CLAUDE.md`'s setup section addresses. |
| 6 | **When does `src/pages/` get test coverage?** Nothing there is tested; a page refactor is unsafe without it. | The page-splitting refactor recorded in `STRUCTURE-REVIEW.md`. |
| 7 | **`src/lib/recurringAmountUpdate.js` has zero tests** despite writing to the DB, re-versioning rules and carrying an error-recovery path. | The largest test gap weighted by risk. |
| 8 | **Fix the four raw palette classes in `src/App.jsx`?** (see D-15) Cheap, four lines. | Full token compliance. |
| 9 | **The `now`-injection seam in `dashboardCalcs.js`** — 268 lines, 10 exports, 6 tests, because `new Date()` is read internally at four points. Agreed to be threaded during the dashboard rebuild. | Deterministic dashboard tests. |
| 10 | **The stale `Test salary` €1000 income entry** on the test account, created 2026-07-10 while screenshotting, with no distribution. | A clean db-verifier run. |

**Evidence:** items 3, 4, 9 and 10 are lifted from existing text in `PROJECT-CONTEXT.md` §4/§6 and
`docs/dashboard-recon.md`; the rest from this audit's artefacts.
**Proposed action:** CREATE `OPEN-QUESTIONS.md`; remove the inline versions from §4/§6 and point at it
**DECISION:** ?
**Notes:**

### D-21 · Rewrite `README.md`
**Currently says:** 16 lines of the **unmodified Vite starter template** — "This template provides
a minimal setup to get React working in Vite with HMR and some ESLint rules." Untouched since
2026-05-18 (DISC-18, and C-016 from Session 2, which you marked `ok` as KEEP-BUT-FLAG).
**Actually true:** it describes a template, not this app. It is the first thing anyone visiting the
GitHub repository sees, and it mentions neither wallets, nor euros, nor how to run the project.
**Proposed text:** a short README — what Financieel is (a personal envelope-budgeting app built on
a wallet model), the stack in one line, `npm install` / `npm run dev` / `npm test`, and a reading
order pointing at `CLAUDE.md`, `PROJECT-CONTEXT.md` and `DESIGN-SPEC.md`. Deliberately short: it is
a signpost, and every word in it is a word that can go stale.
**Evidence:** `README.md`; zero grep hits anywhere in the repo.
**Proposed action:** REWRITE `README.md`
**DECISION:** ?
**Notes:**

### D-22 · How §7, the decision log, is treated
**Ground rule 5, verbatim:** "The decision log is append-only. Entries may be reworded for clarity,
reordered, or grouped — but no decision may be deleted or have its meaning changed… If an entry is
obsolete, mark it superseded and say what superseded it. This log is the most valuable artefact in
the repo."

**Currently:** §7 holds roughly 45 entries across 190 lines in one flat, roughly reverse-
chronological list. Nothing is wrong with its content. It is simply hard to find anything in:
decisions about testing, theming, the capped-wallet mechanic and MCP tooling are interleaved by
date.

**Proposed:**
1. **Group by theme, preserving every entry verbatim** — Money & distribution · Imports · Design
   system · Testing · Tooling & workflow · Schema. Reordering and grouping are explicitly permitted.
2. **Mark exactly two entries superseded**, with what replaced them, and delete nothing:
   - *"Privacy mode deferred to the layout redesign, on purpose"* → **SUPERSEDED 2026-07-13 by
     PR #10**, which shipped it session-only.
   - *"Claude Code now has a read-only Supabase MCP (`claude_ai_Supabase`)"* → **SUPERSEDED**: that
     connector does not persist across restarts; the durable one is the `plugin_supabase_supabase`
     plugin.
3. **Change nothing else.** No rewording, no merging, no deletions.

**The honest case against:** this is the one artefact the brief singles out as most valuable, and
regrouping it produces a large diff in which an accidental change would be easy to miss. If you
would rather not risk it, **mark this `no`** — everything else in this proposal works without it,
and a flat log that is hard to search is a much smaller problem than a damaged one.
**Evidence:** `PROJECT-CONTEXT.md` §7 (lines 644-833); the two superseding facts from DISC-02 and
the tooling memory.
**Proposed action:** REORGANISE `PROJECT-CONTEXT.md` §7 — **grouping + 2 supersede marks, zero deletions**
**DECISION:** ?
**Notes:**

---

## What happens after you decide

I execute only blocks marked `ok`, honouring any `note:`. Blocks left as `?` are reported as
skipped and nothing is touched. After editing I will re-run `npm run build`, `npm test` and
`npm run lint` — documentation changes should not move them, and if they do, something went wrong
and I will stop and say so.

Session 6 (the questionnaire) reads whatever these documents become, so a `no` here is not a dead
end: it just means Session 6 describes the current state instead of the rewritten one.

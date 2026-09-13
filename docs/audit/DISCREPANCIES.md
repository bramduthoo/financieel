# DISCREPANCIES.md — where documentation and reality disagree

> Session 1 of the audit operation, 2026-09-04, Claude Opus 5. Read-only.
> **Recording only. No fixes are proposed here** — that is Session 5's job (`DOCS-PROPOSAL.md`).
>
> Reality = `origin/main` @ `aaeb44e`, whose tree is identical to the audited working tree.
> Every "what is actually true" cell is backed by a file read or a command run this session.
>
> **Live-database verification did not run this session** (`INVENTORY.md` §12). Discrepancies that
> can only be settled by querying the DB are marked **⚠ NEEDS LIVE DB** and stated as a
> contradiction between documents, not as a verdict.

---

## Summary

| Severity | Count | What it means |
|---|--:|---|
| **High** — actively misleading; a session acting on it would do the wrong thing | 6 | D-01 … D-06 |
| **Medium** — stale status; wastes time or causes rework | 8 | D-07 … D-14 |
| **Low** — inaccurate detail, no operational consequence | 7 | D-15 … D-21 |

Highest-risk three: **D-01** (the same file says a migration both is and is not applied),
**D-02** (a shipped feature documented as unbuilt), **D-03** (a documented command that fails).

---

## High

### D-01 — `PROJECT-CONTEXT.md` contradicts itself on whether the CSV-import schema was applied ⚠ NEEDS LIVE DB

- **Claim A:** `PROJECT-CONTEXT.md:205`, §4 heading — "**CSV-import tables (DRAFTED 2026-07-30 —
  NOT applied yet**, `supabase/migrations/20260730120000_csv_import_schema.sql`)", followed by
  "Until then the Import page degrades visibly ('reduced checks' banner) and the recurring/snapshot
  writes are skipped."
- **Claim B:** `PROJECT-CONTEXT.md:~399`, §6 — "**Schema: APPLIED & VERIFIED 2026-07-30** …
  Re-verified read-only after the owner applied it: columns, both `user_id NOT NULL`, every CHECK …
  RLS on, 8/8 policies. The Import page's 'reduced checks' banner is gone."
- **Actually true:** unknown from the repo alone. Two sections of one file directly contradict each
  other. Corroborating evidence for B: the tip commit is `c457b83 "docs: fold the CSV-import schema
  apply + db-verifier PASS into PROJECT-CONTEXT"`, and §6 was clearly the section that commit
  updated while §4's heading was not.
- **Evidence:** `sed -n '133,290p' PROJECT-CONTEXT.md`; `sed -n '371,410p' PROJECT-CONTEXT.md`;
  `git log --oneline -1 c457b83`.
- **Why it is High:** §4 is the section a new session reads to learn the schema. Acting on it means
  believing two live tables do not exist.

### D-02 — Privacy mode is documented as unbuilt; it shipped

- **Claim:** `PROJECT-CONTEXT.md` §6, "DEFERRED from settings phase 1" — "**Privacy mode (hide
  balances)** — prerequisite now DONE … **Still unbuilt — pick it up any time.**"
- **Also claimed:** `PHASE-ROADMAP.md:18` lists "Phase 1 — Privacy mode (small follow-up) —
  CODE-FIRST" as the *next* phase, with a kickoff prompt.
- **Actually true:** shipped in PR #10 ("feat(privacy): session-only 'hide amounts' toggle",
  merged 2026-07-13) and present on `main`: `src/lib/PrivacyContext.jsx`, `setPrivacy()` and the
  `€ ••••` / `€••` masks in `src/lib/format.js:9-10,18-23,37-38`, wired in `src/App.jsx:5,27,32-35`
  and toggled from `src/components/Layout.jsx`. 15 tests in `src/lib/format.test.js`.
- **Evidence:** `gh pr list --state all`; `git grep -l "PrivacyContext" origin/main -- src`; the
  files above.
- **Bonus mismatch:** the roadmap's kickoff prompt says "Add a `hide_balances` boolean to settings
  (draft migration …)". What shipped is **session-only with no DB column** — `format.js:12-16`
  says so explicitly ("Session-only … Resets to visible on reload by design"). The plan and the
  implementation diverged and neither document records the change.

### D-03 — `npm run lint` is documented as a project command; it fails

- **Claim:** `CLAUDE.md` — "Lint: `npm run lint` (ESLint flat config, `eslint.config.js`)", listed
  as a normal command alongside build and test.
- **Actually true:** exits **1**. **44 problems: 33 errors, 11 warnings**, across 19 files —
  `no-unused-vars` ×12, `react-hooks/static-components` ×11, `react-hooks/exhaustive-deps` ×11,
  `react-hooks/immutability` ×6, `react-hooks/set-state-in-effect` ×4.
- **Evidence:** `npm run lint` run this session; full breakdown in `INVENTORY.md` §11.
- **Compounding:** `.github/workflows/test.yml` runs `npm test` **only** — not lint, not build — so
  nothing catches regression. `PROJECT-CONTEXT.md` §6 normalises the number ("44 pre-existing
  problems, 0 new") rather than recording that the command fails.

### D-04 — `CLAUDE.md` forbids chart libraries; `vite.config.js` pre-bundles one

- **Claim:** `CLAUDE.md` — "Charts are **inline SVG only — no chart libraries**."
  `DESIGN-SPEC.md` §7 — "Charts | inline SVG only — chart library import is a violation."
- **Actually true in `src/`:** compliant. Zero chart-library imports; 7 components hand-roll SVG.
- **Actually true in config:** `vite.config.js:10-12` contains
  `optimizeDeps: { include: ['recharts', 'react-is'] }`. `recharts` is **not in `package.json`**,
  **not in `package-lock.json`** (`grep -c recharts package-lock.json` → 0), and **not installed**
  (`ls node_modules/recharts` → no such directory). `react-is` **is** a declared dependency with
  zero hits in `src/`.
- **Evidence:** `cat vite.config.js`; `cat package.json`; the greps above.

### D-05 — `CLAUDE.md` says the reskin covers the whole app; one file was missed

- **Claim:** `CLAUDE.md` — "**Reskin rollout is complete** (R1 + R2): the whole app uses the
  tokens." And: "Prefer the token utilities over raw hex."
- **Actually true:** every file in `src/` uses only token utilities **except `src/App.jsx`**, which
  carries four raw Tailwind palette classes:
  - `src/App.jsx:71` — `bg-gray-50 dark:bg-gray-950` (spec: `bg-cream`)
  - `src/App.jsx:72` — `text-gray-400`
  - `src/App.jsx:84` — `bg-green-500 text-white` (spec: `positive` tokens)
- **Evidence:** `git grep -lE "(bg|text|border)-(gray|slate|…)-[0-9]+" -- src` returns
  `src/App.jsx` and nothing else.
- **Why High:** these are the pre-session loading screen and the post-signup welcome banner — the
  first two things a new user sees, and both ignore the theme.

### D-06 — `supabase/migrations/` file count is wrong in the section that describes it

- **Claim:** `PROJECT-CONTEXT.md:135-139`, §4 preamble — "**Five files exist today**:
  `reset_user_data`, `wallets_cap_max_gte_budget`, `income_recurring_include_in_budget`, and the two
  PDF-import ones (`import_schema`, `import_transactions_rpc`)."
- **Actually true:** **six.** The list omits `20260730120000_csv_import_schema.sql`, committed in
  `3745134` on 2026-07-30 — the same file whose applied-status §4 also gets wrong (D-01).
- **Evidence:** `ls supabase/migrations/` → 6 files.
- **Why High rather than Low:** it is the same paragraph a session reads to decide what the
  migration folder contains, and it is wrong in the same direction as D-01 — both understate the
  CSV work.

---

## Medium — stale status

### D-07 — PR #18 described as open; it merged

- **Claim:** `PROJECT-CONTEXT.md` §6 — "KBC monthly CSV import — DONE, **PR #18 open** (branch
  `b/csv-import`, 2026-07-30)."
- **Actually true:** merged 2026-07-30 (`gh pr list --state all` → `18 … MERGED`). `origin/main` is
  `aaeb44e "Merge pull request #18 from bramduthoo/b/csv-import"` and the remote branch is deleted.
- **Same pattern elsewhere in §6:** the density pass is recorded as "(branch `b/density-pass`,
  2026-07-14; **PR open**)" — PR #11 merged 2026-07-13.

### D-08 — `PHASE-ROADMAP.md` Phase 3 (PDF import) is listed as upcoming; it shipped

- **Claim:** `PHASE-ROADMAP.md:57-84` presents Phase 3 as a future CHAT-FIRST phase, with the two
  design questions still open ("Parsing approach: deterministic parser … vs Claude API extraction
  … vs hybrid") and a kickoff prompt.
- **Actually true:** shipped in PR #17 (merged 2026-07-26) as a deterministic parser. 15 modules in
  `src/lib/import/`, ~200 tests, `pdf-import-plan.md` written and folded in. The decision the
  roadmap poses as open was made and executed.

### D-09 — The roadmap has no Budgeting phase at all

- **Claim:** `PHASE-ROADMAP.md` enumerates five remaining phases (privacy, dashboard, PDF import,
  backup, encryption) plus a parked list, describing itself as "remaining phases, in order".
- **Actually true:** Budgeting Phases A, B, B2-1, B2-2 shipped between 2026-07-17 and 2026-07-21
  across PRs #14, #15 and #16, adding `/budgeting`, `src/lib/budgetPlan.js`,
  `src/lib/budgetFlowLayout.js`, `src/components/budgeting/`, and two migrations. Phase C exists on
  an unpushed branch (`INVENTORY.md` §1.4). None of it appears in the roadmap.
- **Evidence:** `gh pr list`; `budgeting-page-plan.md` (647 lines, the actual authoritative record).

### D-10 — `docs/pdfjs-research-notes.md` still declares nothing was built

- **Claim:** line 3 — "**Status:** research only, nothing installed, no code written. Hand this to
  the build session."
- **Actually true:** `pdfjs-dist@6.1.200` is a pinned dependency, `src/lib/import/extractText.js`
  implements exactly the worker wiring these notes recommended, and the file cites the notes back
  (`extractText.js:4` — "docs/pdfjs-research-notes.md §2"). The build session happened.

### D-11 — `distribution-unallocated-plan.md` calls itself the active phase

- **Claim:** line 3 — "This file covers the **ACTIVE phase**: finishing income-distribution edit
  (Fix C), then building the Unallocated wallet outbound interface (Stage 4)." Line 13 — "That part
  is essentially done (Stages 1–3, Fixes A/B/C). The remaining big piece is the **Unallocated
  wallet outbound interface**."
- **Actually true:** `PROJECT-CONTEXT.md` §5 records "Unallocated wallet outbound (BUILT — DONE)"
  and §6 "Income-distribution & Unallocated-wallet redesign phase: DONE." Confirmed in code:
  `unallocatedPlans.js`, `UnallocatedConflictBanner.jsx`, the outbound `DistributionPopup` mode at
  `WalletDetail.jsx:705-733`, and the `unallocated_*` tables.
- **And §9 repeats it:** `PROJECT-CONTEXT.md:897` lists this file as "finishing distribution + the
  Unallocated wallet **(active phase)**".

### D-12 — `PROJECT-CONTEXT.md` §9 omits the largest plan file and is otherwise incomplete

- **Claim:** §9 "Companion plan files (kept alongside this one)" lists six files.
- **Actually true:** **`budgeting-page-plan.md` (647 lines) is absent**, despite being the
  authority `CLAUDE.md` rule 7 points at for the capped-wallet mechanic ("See `budgeting-page-plan.md`
  §4 (authoritative)"). Also absent: `kbc-adapter-spec.md` is mentioned but
  `kbc-csv-import-background.md` is listed while its companion is not (see D-13), and
  `PHASE-ROADMAP.md` — the file that governs what happens next — is not listed at all.

### D-13 — A referenced companion document does not exist

- **Claim:** `kbc-csv-import-background.md:3-5` — "This file is background only — it contains NO
  build instructions. The build steps live in the separate `kbc-csv-import-instructions.md`. Keep
  the two apart on purpose."
- **Actually true:** `kbc-csv-import-instructions.md` **does not exist** anywhere in the repo, in
  any tracked path, and is referenced by no other file.
- **Evidence:** filesystem check + `git grep -l kbc-csv-import-instructions.md` → only the
  background file itself. **INFERRED:** it was a session-local prompt file that was never committed.

### D-14 — `CLAUDE.md` describes a two-person workflow that no longer has a second person

- **Claim:** `CLAUDE.md` line 5 — "Two-person project: Bram (`b/` branches) and Wouter (`f/`
  branches)." The first-time-setup section is written for "collaborators".
- **Actually true:** **no `f/` branch has ever existed** (`git branch -a --list "*f/*"` → empty).
  The only Wouter-authored ref is `origin/WOUTER`, last commit 2026-06-24, now **67 behind
  `origin/main` and 0 ahead**. `woholvoe` has 6 of 86 commits on `main`, none since June.
- **Not a correctness problem**, but it shapes every workflow rule in the file, and Session 6's
  questionnaire needs to know whether this is still a two-person project.

---

## Low — inaccurate detail

### D-15 — `PROJECT-CONTEXT.md` §3 says the GitHub connector is not connected

- **Claim:** §3 "Connectors status" — "**GitHub connector:** **NOT connected**, the owner couldn't
  find it in the connector list."
- **Actually true:** `github@claude-plugins-official` **is enabled** in `.claude/settings.json`, and
  `CLAUDE.md`'s first-time-setup instructs installing it. It failed to connect *this session*
  (`400: Authorization header is badly formatted`), which is a transient auth fault, not absence.
  The `gh` CLI is authenticated as `bramduthoo` with `repo` + `workflow` scopes.
- The §3 text describes the **chat assistant's** connector rather than Claude Code's plugin, so the
  two statements may both have been true when written — but the section does not say which tool it
  is describing, and a reader will apply it to the wrong one.

### D-16 — `CLAUDE.md`'s plugin list is shorter than `.claude/settings.json`'s

- **Claim:** `CLAUDE.md` — "install the official plugins once (`context7`, `supabase`, `playwright`,
  `github` from `claude-plugins-official`)".
- **Actually true:** `.claude/settings.json` enables **seven**: those four plus `frontend-design`,
  `code-review` and `typescript-lsp`. A collaborator following `CLAUDE.md` installs four and gets
  three silent no-ops.

### D-17 — `ARCHITECTURE.md` is retired but still pointed at by nine files

- **Claim:** `ARCHITECTURE.md:1-6` — "RETIRED … Do **not** rely on anything that used to be here."
- **Actually true:** it is correctly retired, and the *content* is a 21-line pointer. But the
  filename is still referenced by `CLAUDE.md`, `PROJECT-CONTEXT.md`, `pdf-import-plan.md`,
  `.claude/skills/db-migration/SKILL.md` and four `Cursus/` chapters. Most of those references are
  warnings not to trust it, which is defensible; `.claude/skills/db-migration/SKILL.md` is worth a
  look in Session 5 to confirm which kind it is.

### D-18 — `README.md` is the unmodified Vite template

- **Claim:** `README.md` — "This template provides a minimal setup to get React working in Vite with
  HMR and some ESLint rules."
- **Actually true:** 16 lines, unchanged since 2026-05-18, describing neither the app, the wallet
  model, nor how to run it. It is the first file a visitor to the GitHub repo sees.

### D-19 — Four declared dependencies have no usage in `src/`

- **Claim (implicit):** `package.json` `dependencies` are runtime requirements.
- **Actually true:** `path-key` ^4.0.0, `sql` ^0.78.0, `react-is` ^19.2.7 and `supabase` ^2.105.0
  (the **CLI**, listed as a runtime rather than dev dependency) have zero references in `src/`.
  `react-is` is referenced only by the `recharts` optimizeDeps entry of D-04.
- **Evidence:** `git grep` for each across `src/`.

### D-20 — `PROJECT-CONTEXT.md` §4 never documents `unallocated_pending_conflicts` as a table

- **Claim:** §4 documents core, PDF-import, CSV-import and distribution tables in labelled groups.
- **Actually true:** `unallocated_pending_conflicts` is written by `unallocatedPlans.js:103`, read
  by `:61` and `:91`, and drives the whole `UnallocatedConflictBanner` flow — but it appears in §4
  only *inside the prose of `reset_user_data`'s delete list* (line 271), never as an entry with its
  columns. A session reading §4 for the schema would not know its shape.
- **Related:** `budget_allocations` **is** listed in §4 core tables (as just "user_id"), but I found
  no read or write of it anywhere in `src/`. **INFERRED** vestigial. ⚠ NEEDS LIVE DB to confirm it
  still exists.

### D-21 — `DESIGN-SPEC.md` §2 instructs mapping wallet `colour` values; the UI stopped using them

- **Claim:** §2 "Wallet identity ramps" — "Map existing wallet `colour` values onto these families;
  do not invent new hues."
- **Actually true:** R2 replaced colour identity with icon identity — `PROJECT-CONTEXT.md` §6 says
  so ("**Wallet identity is now the ICON, not colour** … colour picker removed, all colour dots
  replaced by icons"), and `walletIcons.js` + `<WalletIcon>` implement it. `wallets.colour` is still
  written by `WalletModal.jsx:79` from a default, but nothing renders from it.
  The five ramps themselves are **not** dead — `.claude/skills/design-check/SKILL.md:24` requires
  their bar stops for flow-diagram source colours. Only the sentence about wallet `colour` is stale.
- **Adjacent tension, not a discrepancy:** `CLAUDE.md` says "Interactive controls are ink/coral —
  **never indigo/purple**", while `DESIGN-SPEC.md` §2 lists a purple ramp (`#EEEDFE`/`#534AB7`, bar
  `#7F77DD`) and design-check requires `#7F77DD` as a flow-diagram stop. Both hold in their own
  scope (controls vs. data-series colour), but nothing in either file says so.

---

## Not a discrepancy — verified accurate, recorded so later sessions do not re-check

These documented claims were tested this session and **hold**:

- `CLAUDE.md` rule 1 — no client-side `wallets.balance` writes. Verified across all 4 wallet write
  sites and the `WalletModal` payload.
- `CLAUDE.md` rule 2 — every insert stamps `user_id`. Verified across all 26 insert sites.
- `CLAUDE.md` rule 7 / `PROJECT-CONTEXT.md` — `cap_reduction_enabled` is a dead column. Confirmed:
  nothing in `src/` reads it; `distributeIncome.js:30` branches on `budget_type` alone.
- `CLAUDE.md` — "Numbers `font-medium tracking-tight` — never bold/semibold". Zero `font-bold` /
  `font-semibold` in `src/`.
- `CLAUDE.md` — "Money renders via `formatMoney()` — never inline `toFixed` on amounts". No amount
  is rendered via inline `toFixed`; all 21 hits are arithmetic helpers or non-money percentages.
- `CLAUDE.md` — the Stop hook runs `npm test`, and CI runs it on every PR. Both confirmed in
  `.claude/settings.json` and `.github/workflows/test.yml`.
- `CLAUDE.md` — `vercel.json` SPA rewrite present.
- `PROJECT-CONTEXT.md` §4 — "the folder is *incomplete* as a schema definition … the live database
  remains the only complete source of truth". Confirmed: migrations start 2026-07-09 and the entire
  base schema plus all four core balance RPCs have no file.
- `PROJECT-CONTEXT.md` §5 — "Recurring income does **not** fire automatically on a date, the user
  logs it manually." Confirmed: no scheduler, cron or edge function exists.
- `PROJECT-CONTEXT.md` §6 — "352 tests green". Exactly 352, 24 files, exit 0.
- `DESIGN-SPEC.md` §2 token values vs `src/index.css`. Every hex matches.

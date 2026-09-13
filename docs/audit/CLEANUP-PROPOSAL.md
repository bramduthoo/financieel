# CLEANUP-PROPOSAL.md — dead-weight sweep

> Session 2 of the audit operation, 2026-09-13, Claude Opus 5. Read-only.
> Decision-block format per `AUDIT-BRIEF.md` §3. **`DECISION:` is always `?` — only the owner
> changes it.** Session 3 executes `ok` blocks only.
>
> **Companion interface:** `docs/audit/cleanup-review.html` — open it by double-clicking. It
> carries every block below in full, autosaves to `localStorage`, and exports
> `cleanup-decisions.json` for the next session to read back. Editing this markdown directly
> works exactly as before; the interface is an addition, never a replacement.

---

## Summary

**21 blocks, C-001 … C-021.**

| Category | Blocks | DELETE | ARCHIVE | KEEP-BUT-FLAG |
|---|--:|--:|--:|--:|
| §1 Vite starter-template leftovers | 5 | 5 | – | – |
| §2 Local artifact directories (not in git) | 4 | 3 | – | 1 |
| §3 Superseded screenshots in `docs/` | 3 | 1 | 2 | – |
| §4 Consumed plan & recon documents | 3 | – | 3 | – |
| §5 Documentation stubs | 2 | – | – | 2 |
| §6 Unused dependencies & stale build config | 4 | 4 | – | – |
| **Total** | **21** | **13** | **5** | **3** |

Nothing here touches `supabase/migrations/`, `.claude/`, `test-fixtures/`, `DESIGN-SPEC.md`,
`CLAUDE.md` or `PROJECT-CONTEXT.md`. Nothing has uncommitted changes — the working tree is clean
as of `bc6aca4`.

### The three highest-risk proposals

1. **C-021 — remove the `recharts` / `react-is` line from `vite.config.js`.** The only block that
   edits build configuration. It is almost certainly inert (the package is not installed), but
   "almost certainly" and `vite.config.js` in one sentence deserves a careful read and a clean
   `npm run build` after.
2. **C-014 / C-015 — archiving `distribution-unallocated-plan.md` and `testing-setup-plan.md`.**
   Both are named in `CLAUDE.md`'s "Key references" list and in `PROJECT-CONTEXT.md` §9. Moving
   them leaves two protected documents pointing at paths that no longer exist until Session 5
   repairs them. **Paired with C-014a below** — do not action one without accepting the doc-repair
   debt.
3. **C-008 — deleting `screens/budgeting-rework/` and `screens/page-header/`.** Its sibling
   **C-009** must be read first: nine screenshots in `screens/` root are cited by
   `docs/dashboard-recon.md` as the evidence base for the *not-yet-started* Phase 2 dashboard
   rebuild. A blanket `screens/` delete would destroy them. C-008 is deliberately scoped to the
   two subfolders only.

### Three things I swept for and did not find

Recorded because absence is a result: **no dead exports**, **no orphaned test fixtures**, **no
stray editor/backup/build files tracked in git**. Details in §7.

---

## §1 — Vite starter-template leftovers

The safest blocks in this file. All five ship with `npm create vite@latest`, none was ever wired
into this app, and all five are unreferenced by anything.

### C-001 · `src/App.css`
**What it is:** 184 lines of plain CSS from the Vite React starter template. Contains only
`.counter`, `.hero`, `.base`, `.framework`, `.vite` rules — the starter's demo counter and logo
animation. Zero `@apply`, `@tailwind`, `:root` or `#root` rules (verified: `grep -c` → 0).
**Why it may go:** **Not imported anywhere.** `git grep --fixed-strings "App.css"` across the repo
returns no hits at all — `src/main.jsx` imports `./index.css` only. It has been dead since the
project's first commit and describes UI that never existed here.
**Risk if actioned:** None identified. Nothing imports it, so the build cannot change.
**Alternative:** Keep as a curiosity. There is no case for it — it is not this project's history,
it is Vite's.
**Proposed action:** DELETE
**DECISION:** ?
**Notes:**

### C-002 · `src/assets/react.svg`
**What it is:** The React logo, from the Vite starter template.
**Why it may go:** Unreferenced. `git grep --fixed-strings "react.svg"` returns no hits in `src/`
or `index.html`.
**Risk if actioned:** None identified.
**Alternative:** Keep. No case.
**Proposed action:** DELETE
**DECISION:** ?
**Notes:**

### C-003 · `src/assets/vite.svg`
**What it is:** The Vite logo, from the starter template.
**Why it may go:** Unreferenced. Same grep result as C-002 — no hits anywhere.
**Risk if actioned:** None identified.
**Alternative:** Keep. No case.
**Proposed action:** DELETE
**DECISION:** ?
**Notes:**

### C-004 · `src/assets/hero.png`
**What it is:** 13 KB image from the Vite starter template.
**Why it may go:** Unreferenced by any source file. Its only consumer was ever `src/App.css`'s
`.hero` block — **so this is paired with C-001.** Deleting `App.css` without this leaves an orphan
image; deleting this without `App.css` leaves CSS referencing a missing file. Both are dead either
way, but action them together.
**Risk if actioned:** None identified.
**Alternative:** Keep. No case.
**Proposed action:** DELETE — **paired with C-001**
**DECISION:** ?
**Notes:**

### C-005 · `public/icons.svg`
**What it is:** 5 KB SVG sprite containing `bluesky-icon`, `discord-icon`, `documentation-icon`,
`github-icon`, `social-icon`, `x-icon` — the Vite starter's social-link sprite.
**Why it may go:** Unreferenced. No `icons.svg` hit and **no `<use>` element anywhere** in `src/`
or `index.html` (verified), so it is not being pulled in as a dynamic sprite either. This app's
icons come from `lucide-react` via `src/lib/walletIcons.js`, per `DESIGN-SPEC.md` §7
("Icons | lucide-react only").
**Risk if actioned:** None identified. Note `public/favicon.svg` **is** referenced from
`index.html:5` and is **not** part of this block.
**Alternative:** Keep. No case — these are social icons for a site that does not exist.
**Proposed action:** DELETE
**DECISION:** ?
**Notes:**

---

## §2 — Local artifact directories (present on disk, not in git)

All four are matched by `.gitignore`, so none is tracked. That cuts both ways: deleting them is a
plain local disk operation that produces **no commit and no diff**, but it is also **not
recoverable from git** — there is no copy in history. Judge accordingly. Together they occupy
~6.1 MB.

### C-006 · `dist/`
**What it is:** Vite build output — 7 files, 2.5 MB. Regenerated in full by `npm run build`
(2.4 s, verified in Session 1).
**Why it may go:** Build artefact, gitignored (`.gitignore` line: `dist`). The brief names "stray
build output" as a sweep category. Nothing references it; Vercel builds from source on its own
infrastructure.
**Risk if actioned:** None identified. `npm run preview` would need a fresh `npm run build` first —
a 2.4 s cost.
**Alternative:** Keep. It costs 2.5 MB and is rebuilt on demand; there is no reason to preserve a
specific old build.
**Proposed action:** DELETE
**DECISION:** ?
**Notes:**

### C-007 · `.playwright-mcp/`
**What it is:** 101 files, 1.9 MB — 60 `page-<timestamp>.yml` accessibility snapshots, 14
`console-<timestamp>.log` files, and ~20 review PNGs. Oldest timestamps are 2026-07-26. Produced
automatically by the Playwright MCP during browser-verification runs.
**Why it may go:** Machine-generated session debris, gitignored explicitly
(`.gitignore`: "Local browser-testing artifacts (Playwright MCP snapshots/logs, review
screenshots)"). Referenced by nothing. The verification *conclusions* these supported are already
folded into `PROJECT-CONTEXT.md` §6.
**Risk if actioned:** None identified. New runs recreate the directory.
**Alternative:** Keep as a record of what was verified in browser — but the logs are timestamped
blobs with no index, so reconstructing which run proved what is impractical.
**Proposed action:** DELETE
**DECISION:** ?
**Notes:**

### C-008 · `screens/budgeting-rework/` and `screens/page-header/`
**What it is:** 14 review screenshots across two subfolders — `budgeting-rework/` (12: multi-income
editor, percent mode, empty states, save-confirm, light + dark) and `page-header/` (2). Produced
while reviewing PR #16 and PR #15.
**Why it may go:** Both PRs **merged** (2026-07-21). Unreferenced — `docs/dashboard-recon.md` is
the only document that cites anything in `screens/`, and it names **only the nine root-level
files**, none of these. They show a Budgeting page that has since had Phase C built against it on
`b/budgeting-performance`.
**Risk if actioned:** Low. These document a merged PR's review; the PR itself is in git history.
**Not recoverable from git** if deleted — gitignored.
**Alternative:** Keep. They are the only visual record of the Budgeting rework review.
**Proposed action:** DELETE — **read C-009 first; this block is deliberately scoped to these two
subfolders and must not be widened to `screens/`**
**DECISION:** ?
**Notes:**

### C-009 · `screens/` root — the nine dashboard/wallets/income PNGs
**What it is:** `dashboard_light_1440.png`, `dashboard_dark_1440.png`, `dashboard_light_390.png`,
`wallets_light_1440.png`, `wallets_dark_1440.png`, `walletdetail_unalloc_light_1440.png`,
`walletdetail_unalloc_dark_1440.png`, `income_light_1440.png`, `income_dark_1440.png`.
**Why it may go:** It may **not**. Recorded here so that a future sweep does not mistake them for
the same class of junk as C-007/C-008. `docs/dashboard-recon.md:6` states "Screenshots live in
**`/screens`** (not `docs/`)" and its §4 cites all nine by name as the evidence base for the
**Phase 2 dashboard rebuild, which has not started**. They are gitignored, so if deleted they are
gone permanently and the recon document loses its illustrations.
**Risk if actioned:** Deleting them would silently break a live plan document for an upcoming
phase. That is precisely the failure mode this audit exists to prevent.
**Alternative:** Move them into `docs/dashboard-recon-screens/` and commit them, so they stop being
one `Remove-Item` away from loss. That is a `MOVE`, and arguably Session 4's call — flagged, not
proposed.
**Proposed action:** KEEP-BUT-FLAG — do not delete while Phase 2 is unbuilt; consider tracking them
**DECISION:** ?
**Notes:**

---

## §3 — Superseded screenshots in `docs/`

These **are** tracked in git, so archiving or deleting them is fully reversible from history.

### C-010 · `docs/redesign-screenshots/` (14 PNGs)
**What it is:** Both-theme screenshots seeded during the R1 + R2 redesign rollout (PRs #7 and #8,
2026-07-10/11): dashboard, income, income-entry-detail, login ×3, settings, wallet-detail fixed and
unallocated, wallets — light and dark.
**Why it may go:** They show a UI superseded **twice** — by the density pass (2026-07-13, whose own
screenshots are C-011) and again by the Budgeting/PageHeader work (2026-07-17 … 07-21). No
individual file is referenced anywhere (verified: `git grep` on each of the 14 basenames returns no
hits). The **folder path** is cited once, at `PROJECT-CONTEXT.md:623`, as evidence that R2 was
verified in both themes.
**Risk if actioned:** Archiving preserves that evidence; the `PROJECT-CONTEXT.md:623` path would
need updating to `docs/archive/…`, which is Session 5's job. Deleting instead would break the
citation outright.
**Alternative:** DELETE — the brief explicitly sanctions it ("Deletion is for genuine noise: build
artefacts, superseded screenshots"). I recommend against it here only because the folder is cited
as proof a merged PR was verified.
**Proposed action:** ARCHIVE → `docs/archive/redesign-screenshots/`
**DECISION:** ?
**Notes:**

### C-011 · `docs/density-screenshots/` (8 PNGs)
**What it is:** Both-theme screenshots from the density & completeness pass (PR #11, 2026-07-13):
income, settings, walletdetail, wallets — light and dark.
**Why it may go:** Same reasoning as C-010, one generation later. Superseded by the Budgeting and
PageHeader work. No individual file referenced (verified per basename); the folder path is cited
once at `PROJECT-CONTEXT.md:475`.
**Risk if actioned:** Same as C-010 — the one folder-level citation needs a Session 5 update.
**Alternative:** DELETE, or keep — these are the newest of the three screenshot sets and the
closest to current UI, so they are the most defensible to retain in place.
**Proposed action:** ARCHIVE → `docs/archive/density-screenshots/`
**DECISION:** ?
**Notes:**

### C-012 · `docs/income_straightFromClaudeInterface.png`, `docs/settings_straightFromClaudeInterface.png`, `docs/wallet_straightFromClaudeInterface.png`
**What it is:** Three mockup images whose filenames say they are raw exports from a chat interface.
**Why it may go:** Unreferenced — `git grep` on all three basenames returns nothing.
**INFERRED** (I did not open them, per the brief's rule on binary assets): they appear to be the raw
versions of the three cleaned-up mockups `docs/wallets.png`, `docs/income.png`, `docs/settings.png`,
which **are** cited — at `DESIGN-SPEC.md:183`, as the owner-approved mockups behind the density
pass. If that inference is right they are redundant duplicates; if it is wrong they are three
unreferenced images either way.
**Risk if actioned:** Low, and zero if archived — they are tracked, so git can restore them.
**Note the pairing:** `docs/wallets.png`, `docs/income.png` and `docs/settings.png` are **NOT** in
this block and must not be swept with it. They are load-bearing for `DESIGN-SPEC.md`, a protected
file.
**Alternative:** ARCHIVE instead of DELETE, if the design-iteration history is worth 900 KB.
**Proposed action:** DELETE
**DECISION:** ?
**Notes:**

---

## §4 — Consumed plan & recon documents

Plan files whose phase has shipped and whose conclusions now live in `PROJECT-CONTEXT.md`.

**Read this first.** Four other root plan files are **deliberately not proposed** here, because
they are cited from *source-code comments* as living specifications, not consumed prompts:
`pdf-import-plan.md` (cited by 10 files incl. `dedupe.js`, `suggestWallet.js`, `types.js`),
`kbc-adapter-spec.md` (cited by `banks/kbc.js`, `normalize.js`), `kbc-csv-import-background.md`
(cited by `banks/kbcCsv.js`, `matchRecurring.js`, `reconcile.js`, `monthlySnapshots.js`) and
`budgeting-page-plan.md` (cited by `resolveCappedInflow.js`, `budgetPlan.js`,
`budgetFlowLayout.js`, and named authoritative by `CLAUDE.md` rule 7). Moving any of those would
invalidate citations inside working code.

### C-013 · `docs/settings-recon.md`
**What it is:** 152-line read-only reconnaissance for the settings-page planning session, written
against branch `b/testing-finish` (2026-07-08). Explicitly report-only: "Decisions happen in the
planning session — this is an inventory with a recommendation per item."
**Why it may go:** Fully consumed. The planning session happened and shipped as PR #6 (settings
phase 1 hygiene, 2026-07-09); its decisions are recorded in `PROJECT-CONTEXT.md` §6. Referenced by
exactly one file — `PROJECT-CONTEXT.md` — and only as provenance ("Recon: …").
**Risk if actioned:** Low. One citation in `PROJECT-CONTEXT.md` needs its path updated (Session 5).
The document still explains *why* settings ended up as it did, which is worth keeping somewhere.
**Alternative:** KEEP-BUT-FLAG — it is only 152 lines and does no harm in `docs/`.
**Proposed action:** ARCHIVE → `docs/archive/settings-recon.md`
**DECISION:** ?
**Notes:**

### C-014 · `distribution-unallocated-plan.md`
**What it is:** 121-line plan for finishing income-distribution edit (Fix C) and building the
Unallocated outbound interface (Stage 4).
**Why it may go:** The phase is **done**. `PROJECT-CONTEXT.md` §5 records "Unallocated wallet
outbound (BUILT — DONE)" and §6 "Income-distribution & Unallocated-wallet redesign phase: DONE",
and the code confirms it (`unallocatedPlans.js`, `UnallocatedConflictBanner.jsx`, the outbound
`DistributionPopup` mode at `WalletDetail.jsx:705`). Meanwhile the file's own header still declares
itself "the ACTIVE phase" — recorded as discrepancy **D-11**. Leaving a shipped plan claiming to be
active is exactly the drift this operation exists to remove.
**Risk if actioned:** **This is one of the three highest-risk blocks.** The filename is referenced
by `CLAUDE.md` ("Key references … phase plans"), `PROJECT-CONTEXT.md` §9 (where it is listed as
"(active phase)"), and `ARCHITECTURE.md`. Archiving it leaves three documents — one of them
protected — pointing at a moved path. **Paired with C-015: both create the same doc-repair debt,
and Session 5 should fix them in one pass.**
**Alternative:** KEEP-BUT-FLAG, and let Session 5 simply correct the "ACTIVE phase" header in place.
That is lower risk and arguably achieves the same thing.
**Proposed action:** ARCHIVE → `docs/archive/distribution-unallocated-plan.md` — **paired with
C-015**
**DECISION:** ?
**Notes:**

### C-015 · `testing-setup-plan.md`
**What it is:** 104-line handoff note for setting up Vitest, CI and merge protection. Self-describes
as "a handoff note to kickstart… Feed it back into a conversation to resume this topic."
**Why it may go:** Shipped as PR #4 (2026-07-07). The suite exists (352 tests, 24 files), CI runs on
every PR, and the decisions and deliberate omissions are recorded in `docs/testing-notes.md`, which
is the living document and **is** cited from `src/lib/dashboardCalcs.test.js`. This file is the
consumed prompt; `testing-notes.md` is the durable record.
**Risk if actioned:** Same doc-repair debt as C-014 — referenced by `CLAUDE.md`,
`PROJECT-CONTEXT.md` §9 and `ARCHITECTURE.md`.
**Alternative:** KEEP-BUT-FLAG. It is 104 lines and harmless where it sits.
**Proposed action:** ARCHIVE → `docs/archive/testing-setup-plan.md` — **paired with C-014**
**DECISION:** ?
**Notes:**

---

## §5 — Documentation stubs: flag, do not remove

### C-016 · `README.md`
**What it is:** 16 lines. The **unmodified** Vite starter README — "This template provides a minimal
setup to get React working in Vite with HMR and some ESLint rules." Untouched since 2026-05-18.
**Why it may go:** It may not — a repository needs a README. But it is referenced by nothing
(verified: zero grep hits) and describes a template rather than this app. It is the first thing a
visitor to github.com/bramduthoo/financieel sees, and it says nothing about wallets, envelopes,
euros, or how to run the project. Recorded as discrepancy **D-18**.
**Risk if actioned:** None — KEEP-BUT-FLAG changes nothing today.
**Alternative:** Have Session 5 rewrite it (what the app is, the stack, `npm run dev`, and a pointer
to `PROJECT-CONTEXT.md` / `CLAUDE.md`). That is the outcome I would expect; this block exists to
put it on the record so it is not forgotten.
**Proposed action:** KEEP-BUT-FLAG — stale; rewrite in Session 5
**DECISION:** ?
**Notes:**

### C-017 · `ARCHITECTURE.md`
**What it is:** 21 lines. Not a document — a **tombstone**: "This file is retired as a source of
truth… they were wrong in ways that caused real incidents when trusted. Do **not** rely on anything
that used to be here."
**Why it may go:** It may not, and the reasoning is worth stating plainly so nobody deletes it in a
later sweep. Its filename is still referenced by **nine** files, including `CLAUDE.md` and
`.claude/skills/db-migration/SKILL.md`. Most of those references are *warnings not to trust it* —
which only work if the file is there to be found. Deleting the tombstone would leave nine dangling
references and remove the warning that the incidents produced.
**Risk if actioned:** None — KEEP-BUT-FLAG changes nothing.
**Alternative:** ARCHIVE it and update the nine references. Higher effort, no benefit; the file is
21 lines.
**Proposed action:** KEEP-BUT-FLAG — deliberate tombstone, doing its job
**DECISION:** ?
**Notes:**

---

## §6 — Unused dependencies & stale build config

Not file deletions. These edit `package.json`, `package-lock.json` and `vite.config.js`, so they
carry more risk than anything above and are placed last deliberately. Ground rule 8 forbids me
acting on them; these blocks are the approval mechanism. **If any is marked `ok`, Session 3 must
re-run `npm install`, `npm run build`, `npm test` and `npm run lint` and compare against
`INVENTORY.md` §10–§11 (352 tests, build clean, 44 lint problems) before committing.**

### C-018 · Remove the `sql` dependency from `package.json`
**What it is:** `"sql": "^0.78.0"` — declared as a runtime dependency.
**Why it may go:** **Zero references in the entire repo** outside `package.json` (verified for both
`'sql'` and `"sql"` quoting). It is also the single worst security item in the project:
`npm audit` (run 2026-09-07) shows it carries a moderate "SQL Injection in `sql`" advisory with
**no fix available**, and `npm ls lodash` proves it is the *sole* reason `lodash@4.1.0` is
installed:

```
financieel@0.0.0
└─┬ sql@0.78.0
  └── lodash@4.1.0
```

That `lodash` is the project's **only critical vulnerability** and carries nine advisories
(prototype pollution ×5, command injection, ReDoS, `_.template` code injection), also with no fix
available. **Removing this one unused line eliminates the critical finding and one moderate, with
no code change.**
**Risk if actioned:** Low but not nil — `package-lock.json` is regenerated, which is a large diff.
Nothing imports the package, so the build cannot break on a missing module.
**Alternative:** Keep and accept the advisories. There is no upgrade path: both packages are
effectively abandoned upstream.
**Proposed action:** DELETE (the dependency entry) — **highest value block in this file**
**DECISION:** ?
**Notes:**

### C-019 · Remove the `supabase` CLI from `dependencies`
**What it is:** `"supabase": "^2.105.0"` — the Supabase **command-line tool**, declared as a
*runtime* dependency of a browser app.
**Why it may go:** Unused, and the workflow says so. There is **no `supabase/config.toml`** (the
directory contains only `migrations/`), so the CLI is not initialised against this project, and
`PROJECT-CONTEXT.md:142` states outright: "there is no migration runner, no `supabase db push` in
the workflow. The owner applies each file by hand." No script, doc or source file invokes it.
**Risk if actioned:** If you ever intend to run `npx supabase …` locally, removing it makes that a
download-on-demand rather than an error — but it would no longer be pinned. This is the block most
likely to be a deliberate choice I cannot see from the repo, so it is worth a moment's thought
rather than a reflex `ok`.
**Alternative:** Move it to `devDependencies`, which is where a CLI belongs regardless of whether
it is kept. That is the safer half-step.
**Proposed action:** DELETE (the dependency entry) — or see Alternative
**DECISION:** ?
**Notes:**

### C-020 · Remove the `path-key` and `react-is` dependencies
**What it is:** `"path-key": "^4.0.0"` and `"react-is": "^19.2.7"`.
**Why it may go:** Neither appears anywhere in `src/`. `path-key` has **no reference in the repo at
all**. `react-is` is referenced in exactly one place — the `optimizeDeps` line in `vite.config.js`
that C-021 removes — where it sits alongside `recharts` as that library's peer. With `recharts`
absent, `react-is` has nothing to support.
**Risk if actioned:** Low. **Paired with C-021** — if C-021 is refused, `react-is` should stay, or
Vite will be told to pre-bundle a package that is no longer installed. `path-key` is independent
and safe to remove either way.
**Alternative:** Remove `path-key` only and leave `react-is` until C-021 is decided.
**Proposed action:** DELETE (both dependency entries) — **`react-is` half paired with C-021**
**DECISION:** ?
**Notes:**

### C-021 · Remove the `optimizeDeps` block from `vite.config.js`
**What it is:**

```js
optimizeDeps: {
  include: ['recharts', 'react-is'],
},
```

**Why it may go:** It instructs Vite to pre-bundle **`recharts`, which is not installed** — absent
from `package.json`, absent from `package-lock.json` (`grep -c recharts package-lock.json` → 0) and
absent from `node_modules/`. It is also the exact thing the project's own rules forbid:
`CLAUDE.md` — "Charts are **inline SVG only — no chart libraries**"; `DESIGN-SPEC.md` §7 — "chart
library import is a violation". The app complies in `src/` (7 components hand-roll inline SVG, zero
chart-library imports); only this config line still points at the abandoned approach. Recorded as
discrepancy **D-04**.
**Risk if actioned:** **The highest-risk block in this file**, purely because it edits build
configuration. In practice Vite silently ignores an unresolvable `optimizeDeps.include` entry —
which is why the build is green today — so removing it should be a no-op. "Should be" is why this
one gets a full `npm run build` before commit rather than after.
**Alternative:** Leave it. It is inert and costs nothing but confusion for the next reader who
greps for `recharts` and wonders whether a chart library is sneaking in.
**Proposed action:** DELETE (the `optimizeDeps` block) — **paired with C-020's `react-is` half**
**DECISION:** ?
**Notes:**

---

## §7 — Swept, nothing found

Per ground rule 7, these are reported as empty rather than padded with weak candidates.

**Unused exports in `src/lib/` — none.** I checked every export in all 31 non-test lib modules for
references outside its own file. Five looked unused at first pass and **all five survived
inspection**:

| Export | Verdict |
|---|---|
| `buildRuleRows` (`budgetPlan.js`) | Used internally at `budgetPlan.js:146` by `autoFillSingle` |
| `balanceBefore` (`monthlySnapshots.js`) | Used internally at `monthlySnapshots.js:44` |
| `planAmount` (`unallocatedPlans.js`) | Used internally at `:24` and `:84` |
| `ADAPTERS` (`detectBank.js`) | Used internally at `:10` and `:20` |
| `walletIcon` (`walletIcons.js`) | Used internally at `:49` by `<WalletIcon>` |

The last two are exported but consumed only within their own module, so the `export` keyword is
redundant. That is a code change, not a cleanup, and ground rule 8 says record it — recorded here,
not proposed.

**Orphaned test fixtures — none.** All five files under `test-fixtures/` are loaded by tests. The
four `kbc-mobile-export/*.txt` fixtures are pulled in via template literal
(``fixture(`${name}.txt`)``) and all four names appear explicitly in the `ALL_FOUR` /
`ALL_FIXTURES` arrays at `buildRows.test.js:22` and `kbc.test.js:22`.
`kbc-csv/monthly-export-01.csv` is loaded by four separate test files. (`test-fixtures/` is a
protected path regardless.)

**Stray editor, backup or build files tracked in git — none.** No `.bak`, `.orig`, `.rej`, `.tmp`,
`.swp`, `.DS_Store`, `.log`, `~`, `.vscode/` or `.idea/` file is tracked. No committed conflict
markers. No untracked non-ignored files remain (all three were committed in `7409024` / `bc6aca4`).

**Bulk relocation of root plan files — not proposed here, by design.** Nine `.md` plan/spec files
sit in the repo root and there is a reasonable case they belong in `docs/`. That is a *structural*
question about repository layout, which is **Session 4's** remit — and `AUDIT-BRIEF-ADDENDUM.md`
§1 judges root/docs hygiene "separately and to a lower bar". Per the addendum's independence rule,
nothing in this file is conditional on that decision, and nothing here should be deferred waiting
for it.

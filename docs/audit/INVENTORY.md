# INVENTORY.md — the factual map

> Produced by **Session 1** of the audit operation (`docs/audit/AUDIT-BRIEF.md`), 2026-09-04,
> Claude Opus 5. Read-only session. Every claim here is traceable to a command run or a file read
> in that session. Where a statement is inference rather than verification it is marked
> **INFERRED**.
>
> **Working tree audited:** local branch `b/csv-import` @ `c457b83`, whose tree is byte-identical
> to `origin/main` @ `aaeb44e` (verified: `git diff --stat origin/main -- .` is empty). So "the
> code" below means main.
>
> **Not done in this session:** live-DB schema verification. The Supabase MCP needs a fresh OAuth
> per session and it was not completed. Every schema statement below is sourced from
> `supabase/migrations/*.sql` and from code, **not** from the live database. See §12.

---

## 1. Git state — READ THIS FIRST (the Session-2 gate)

### 1.1 Headline

**There are zero open pull requests.** All 18 PRs the repo has ever had are `MERGED`
(`gh pr list --state all --limit 25`). PR #18 (`b/csv-import`) merged 2026-07-30.

**But two local branches carry work that never reached `origin`,** and one of them is a
substantial unmerged feature. This is the thing the owner must decide about before Session 2.

### 1.2 Current position

| | |
|---|---|
| Current branch | `b/csv-import` @ `c457b83` |
| `git status --short` | `?? PHASE-ROADMAP.md`, `?? docs/audit/`, `?? docs/dashboard-recon.md` — **three untracked paths, zero modified tracked files** |
| Local `main` | `919a71d`, **3 behind** `origin/main` |
| `origin/main` | `aaeb44e` "Merge pull request #18 from bramduthoo/b/csv-import" |

`git fetch origin --prune` was run at the start of this session (read-only, permitted by ground
rule 1). It pruned `origin/b/csv-import` (deleted server-side on merge) and advanced `origin/main`
`919a71d → aaeb44e`. No working-tree change resulted.

### 1.3 Every local branch vs `origin/main`

| Branch | Tip | Behind | Ahead | Tracking | Verdict |
|---|---|---:|---:|---|---|
| `b/budgeting-performance` | `5880d59` | 6 | **2** | (none — never pushed) | ⚠️ **UNMERGED FEATURE. See 1.4.** |
| `b/budgeting-rework` | `ead4af1` | 7 | 0 | `[gone]` | Merged leftover (PR #16). Safe to delete. |
| `b/csv-import` *(HEAD)* | `c457b83` | 1 | 0 | `[gone]` | Merged leftover (PR #18). Safe to delete once off it. |
| `b/pdf-import` | `474fc55` | 4 | 0 | `[gone]` | Merged leftover (PR #17). Safe to delete. |
| `b/privacy-mode` | `c6e4f15` | 24 | **3** | (none — never pushed) | See 1.5 — content already in main. |
| `main` | `919a71d` | 3 | 0 | `origin/main` | Needs `git pull --ff-only`. |

Remote branches: `origin/main`, `origin/WOUTER`. Nothing else.

### 1.4 ⚠️ `b/budgeting-performance` — an unmerged, unpushed feature

Two commits ahead of `origin/main`, never pushed, no PR:

- `20c098b feat(budgeting): add the budget-performance section (Phase C)`
- `5880d59 docs: fold Budgeting Phase C (+ B2 catch-up) into PROJECT-CONTEXT`

`git diff --stat origin/main...b/budgeting-performance` — 16 files, **+1306 / −46**:

```
 .claude/skills/design-check/SKILL.md                 |   3 +-
 DESIGN-SPEC.md                                       |  18 +-
 PROJECT-CONTEXT.md                                   |  58 ++-
 budgeting-page-plan.md                               |  43 +-
 budgeting-phase-C.md                                 | 223 +++++++++   (NEW FILE)
 docs/testing-notes.md                                |  18 +
 src/components/WalletModal.jsx                       |   3 +-
 src/components/budgeting/AttentionList.jsx           |  60 +++       (NEW)
 src/components/budgeting/BudgetFlowChart.jsx         |  51 +-
 src/components/budgeting/BudgetPerformanceChart.jsx  | 107 +++       (NEW)
 src/components/budgeting/ExecutionStatusLine.jsx     |  61 +++       (NEW)
 src/components/budgeting/WalletPerformanceGrid.jsx   | 137 +++       (NEW)
 src/components/budgeting/WalletTile.jsx              |   8 +
 src/lib/budgetPerformance.js                         | 213 +++       (NEW, pure lib)
 src/lib/budgetPerformance.test.js                    | 268 +++       (NEW, tests)
 src/pages/Budgeting.jsx                              |  81 +-
```

Verified absent from `origin/main`: `git grep -i "budgetPerformance\|BudgetPerformance" origin/main -- src`
returns nothing.

**This is not a fast-forward.** The branch is 6 commits behind `origin/main` and predates the PDF
import, the CSV import and three migrations, so landing it requires a rebase/merge, not a push.
Its `5880d59` also edits `PROJECT-CONTEXT.md` (+54 lines) declaring Phase C shipped — text that
would conflict with whatever Session 5 writes.

**Decision required from the owner before Session 2:** land it, park it, or abandon it.

### 1.5 `b/privacy-mode` — stale, content already shipped

Three commits ahead (`3a08b4e` currency setting, `1ff91c8` privacy toggle, `c6e4f15` currency
revert), 24 behind. All three landed on `main` under different SHAs — PR #9 and PR #10 are
`MERGED`, and the net state matches: `src/lib/PrivacyContext.jsx` exists in `origin/main`,
`formatMoney()` carries the mask, and `git grep -i currency origin/main -- src` finds only
import-pipeline hits (no currency picker), so the revert is reflected too. **INFERRED** conclusion:
nothing unique remains on this branch.

### 1.6 `origin/WOUTER`

67 behind `origin/main`, **0 ahead**. Last commit `f15c24f "dark mode"`, 2026-06-24, author
`woholvoe`. Fully contained in `main`. `woholvoe` has 6 commits on `main` all-time out of 86.
**No `f/` branch exists anywhere** (`git branch -a --list "*f/*"` is empty), although `CLAUDE.md`
describes the project as two-person with `f/` branches for Wouter.

### 1.7 Last 15 commits on `origin/main`

```
aaeb44e Merge pull request #18 from bramduthoo/b/csv-import
c457b83 docs: fold the CSV-import schema apply + db-verifier PASS into PROJECT-CONTEXT
3745134 feat(import): KBC monthly CSV import (second import source)
919a71d Merge pull request #17 from bramduthoo/b/pdf-import
474fc55 feat(wallets): make a cost's name editable from Payment history
8384d81 feat(import): KBC PDF bank-statement import (Phase 3)
87a41b0 Merge pull request #16 from bramduthoo/b/budgeting-rework
ead4af1 feat(budgeting): rework the Budgeting page (Phase B2-2)
79a3115 Merge pull request #15 from bramduthoo/b/page-header
427f96f feat(ui): add the shared PageHeader primitive (Budgeting Phase B2-1)
9fa639e Merge pull request #14 from bramduthoo/b/capped-wallet-fix
fda7cd5 feat(budgeting): add the Budgeting page (multi-income control + Sankey)
1316154 feat(wallets): redesign capped-wallet mechanic (Budgeting Phase A)
047674a Merge pull request #13 from bramduthoo/b/workflow-sync-protocol
865598b docs(workflow): declare marketplace + first-time machine setup for collaborators
```

History spans 2025-12-18 → 2026-07-30. **Nothing has been committed to `main` in 5 weeks**
(last commit 2026-07-30; today 2026-09-04).

### 1.8 All 18 PRs (all merged)

| # | Title | Branch | Merged |
|--:|---|---|---|
| 18 | KBC monthly CSV import (second import source) | `b/csv-import` | 2026-07-30 |
| 17 | KBC PDF bank-statement import + editable cost name | `b/pdf-import` | 2026-07-26 |
| 16 | feat(budgeting): rework the Budgeting page (Phase B2-2) | `b/budgeting-rework` | 2026-07-21 |
| 15 | feat(ui): shared PageHeader primitive (Budgeting Phase B2-1) | `b/page-header` | 2026-07-21 |
| 14 | Budgeting Phases A + B: capped-wallet mechanic + Budgeting page | `b/capped-wallet-fix` | 2026-07-19 |
| 13 | docs(workflow): require origin/main sync + branch hygiene | `b/workflow-sync-protocol` | 2026-07-15 |
| 12 | chore(mcp): scope official plugins to this project | `b/mcp-scoping` | 2026-07-15 |
| 11 | Density & completeness pass | `b/density-pass` | 2026-07-13 |
| 10 | feat(privacy): session-only "hide amounts" toggle | `b/hide-amounts` | 2026-07-13 |
| 9 | feat(settings): display currency setting | `b/currency-setting` | 2026-07-13 |
| 8 | Redesign R2: full rollout | `b/redesign-rollout` | 2026-07-11 |
| 7 | Redesign foundation (the blend) | `b/redesign-foundation` | 2026-07-10 |
| 6 | Settings phase 1 (hygiene) | `b/settings-hygiene` | 2026-07-09 |
| 5 | Resolver lift: pure resolveDistribution + settings recon | `b/testing-finish` | 2026-07-08 |
| 4 | Testing setup: Vitest behaviour tests + CI | `b/testing-setup` | 2026-07-07 |
| 3 | fix(claude): re-point db-verifier to persistent supabase MCP | `b/claude-workflow-setup` | 2026-07-07 |
| 2 | Bootstrap & verify Claude Code workflow config | `b/claude-workflow-setup` | 2026-07-07 |
| 1 | B/multi user support | `b/multi-user-support` | 2026-06-26 |

`gh auth status`: logged in as `bramduthoo`, scopes `gist, read:org, repo, workflow`. The **GitHub
MCP plugin failed to connect this session** (`400: Authorization header is badly formatted`); the
`gh` CLI works fine and is what produced the table above.

---

## 2. Dependencies & scripts (`package.json`)

Scripts: `dev` → `vite` · `build` → `vite build` · `lint` → `eslint .` · `preview` → `vite preview`
· `test` → `vitest run` · `test:watch` → `vitest`.

### Dependencies

| Package | Version | Used? |
|---|---|---|
| `@supabase/supabase-js` | ^2.106.0 | yes — `src/lib/supabase.js` |
| `date-fns` | ^4.2.1 | yes — widely |
| `lucide-react` | ^1.16.0 | yes — `walletIcons.js` + UI |
| `pdfjs-dist` | 6.1.200 (pinned) | yes — `src/lib/import/extractText.js` only |
| `react` / `react-dom` | ^19.2.7 | yes |
| `react-router-dom` | ^7.15.1 | yes — `src/App.jsx` |
| `path-key` | ^4.0.0 | 🚩 **no hits in `src/`** |
| `react-is` | ^19.2.7 | 🚩 **no hits in `src/`** — only referenced by `vite.config.js` `optimizeDeps` |
| `sql` | ^0.78.0 | 🚩 **no hits in `src/`** |
| `supabase` | ^2.105.0 | 🚩 the **CLI**, listed as a runtime dependency, no hits in `src/` |

### devDependencies

`@eslint/js` ^10.0.1 · `@tailwindcss/vite` ^4.3.0 · `@types/react` ^19.2.14 · `@types/react-dom`
^19.2.3 · `@vitejs/plugin-react` ^6.0.1 · `eslint` ^10.3.0 · `eslint-plugin-react-hooks` ^7.1.1 ·
`eslint-plugin-react-refresh` ^0.5.2 · `globals` ^17.6.0 · `tailwindcss` ^4.3.0 · `vite` ^8.0.16 ·
`vitest` ^4.1.10.

### 🚩 `vite.config.js` pre-bundles a package that is not installed

```js
optimizeDeps: { include: ['recharts', 'react-is'] },
```

`recharts` is **not** in `package.json`, **not** in `package-lock.json`
(`grep -c recharts package-lock.json` → 0) and **not** in `node_modules`. It is also the exact
thing `CLAUDE.md` forbids ("Charts are inline SVG only — no chart libraries"). `react-is` appears
to be its orphaned peer. Build passes regardless (Vite ignores an unresolvable optimizeDeps entry).

### `npm audit` — run 2026-09-07 (deferred from the 2026-09-04 sitting, where it hit the 120 s cap)

**10 vulnerabilities: 1 critical, 6 high, 2 moderate, 1 low.** 253 packages (26 prod, 208 dev,
64 optional).

| Package | Severity | Direct? | Fix available |
|---|---|---|---|
| `lodash` | **critical** | no | **none** — see below |
| `brace-expansion` | high | no | yes |
| `browserslist` | high | no | yes |
| `nanoid` | high | no | yes |
| `postcss` | high | no | yes |
| `react-router` | high | no | yes |
| `pdfjs-dist` | high | **yes** | `6.3.289` (non-major, from the pinned `6.1.200`) |
| `react-router-dom` | moderate | **yes** | yes |
| `sql` | moderate | **yes** | **none** |
| `@babel/core` | low | no | yes |

🚩 **The critical finding traces entirely to an unused dependency.** `npm ls lodash`:

```
financieel@0.0.0
└─┬ sql@0.78.0
  └── lodash@4.1.0
```

`sql` is one of the four declared dependencies with **zero references in `src/`** (§2 above). It
carries a moderate "SQL Injection in `sql`" advisory itself and is the sole reason `lodash@4.1.0`
is installed — which accounts for **nine** advisories including the only critical one (prototype
pollution ×5, command injection, ReDoS, `_.template` code injection). Neither has a fix available
because both packages are effectively abandoned upstream.

**Removing `sql` from `package.json` would eliminate the critical and one moderate outright**, with
no code change, since nothing imports it. `pdfjs-dist` is the only *genuinely used* direct
dependency with a vulnerability, and its fix is a non-major bump.

Recording only — per ground rule 8, no action taken. `CLAUDE.md` rule 5 forbids
`npm audit fix --force`, and the Bash guard hook blocks it.

---

## 3. File tree with line counts

192 tracked files (excluding `node_modules`). Binary assets are listed but were not opened.
**Files over 400 lines are marked 🔴.**

### Repo root

```
  21  ARCHITECTURE.md                    (retired stub)
 112  CLAUDE.md
 237  DESIGN-SPEC.md
 908  PROJECT-CONTEXT.md                 🔴
  16  README.md                          (untouched Vite template)
  85  backup-restore-feature-plan.md
 647  budgeting-page-plan.md             🔴
 121  distribution-unallocated-plan.md
 159  encryption-with-key-plan.md
 183  kbc-adapter-spec.md
 142  kbc-csv-import-background.md
 337  pdf-import-plan.md
 104  testing-setup-plan.md
 110  PHASE-ROADMAP.md                   ** UNTRACKED **
  41  package.json      3739 package-lock.json 🔴
  21  eslint.config.js    12 vite.config.js    12 vitest.config.js
  13  index.html           4 vercel.json       28 .gitignore
```

Also in root, untracked/ignored: `.env.local`, `.env.test.local` (both matched by `*.local`),
`dist/` (build output, ignored), `.playwright-mcp/` (**98 console logs**, ignored),
`screens/` (**11 entries**, ignored).

### `src/` (61 tracked files)

```
  117  src/App.jsx
  184  src/App.css                     ** NOT IMPORTED ANYWHERE ** (git grep "App.css" → no hits)
   10  src/main.jsx
   59  src/index.css                   design tokens (@theme + .dark)
        src/assets/hero.png (13 KB), react.svg, vite.svg   ** none referenced from src/ or index.html **

pages/
  1225  Income.jsx                     🔴
  1194  Import.jsx                     🔴
   989  WalletDetail.jsx               🔴
   546  Settings.jsx                   🔴
   534  IncomeRecurringDetail.jsx      🔴
   508  Budgeting.jsx                  🔴
   416  Dashboard.jsx                  🔴
   303  Login.jsx
   192  Wallets.jsx
   115  ResetPassword.jsx

components/            (shared-primitive vs feature-specific marked in §5)
   465  DistributionPopup.jsx          🔴
   458  PaymentHistory.jsx             🔴
   454  RecurringRules.jsx             🔴
   319  VariableHistory.jsx    306  WalletModal.jsx      254  VariableOverview.jsx
   250  UpcomingPayments.jsx   179  TransactionChecklist.jsx  176  VariableTransactionForm.jsx
   155  WalletTrendsChart.jsx  151  UnallocatedConflictBanner.jsx  130  WalletCard.jsx
   122  VariableTransactionList.jsx  117  ProjectedBalanceChart.jsx   100  Layout.jsx
    92  IncomeSpendingChart.jsx  76  CashTrendChart.jsx    58  SalaryGrowthChart.jsx
    37  IncomeConfirmModal.jsx
components/budgeting/
   195  DistributionEditor.jsx  141  BudgetFlowChart.jsx   50  WalletTile.jsx
components/ui/          (the shared primitives)
    48  PageHeader.jsx   34  CompactRow.jsx   32  SummaryStrip.jsx
    15  GhostAddCard.jsx  13  MetricBar.jsx   10  CardFooterMeta.jsx

lib/
   268  dashboardCalcs.js    237  budgetFlowLayout.js   175  budgetPlan.js
   172  recurringUtils.js    111  recurringAmountUpdate.js  111  unallocatedPlans.js
    64  distributeIncome.js   55  resolveDistribution.js    53  incomeMetrics.js
    50  walletIcons.js        47  format.js               28  resolveCappedInflow.js
    67  walletMetrics.js      10  supabase.js
     3  PrivacyContext.jsx     3  ThemeContext.jsx
lib/import/
   312  banks/kbcCsv.js      216  buildCsvRows.js       206  banks/kbc.js
   286  matchRecurring.js    153  buildRows.js          131  normalize.js
   110  monthlySnapshots.js  104  reconcile.js           97  dedupe.js
    72  csv.js                71  suggestWallet.js       64  extractText.js
    48  textLayout.js         38  types.js               35  detectBank.js
lib/*.test.js + lib/import/*.test.js — 24 files, see §8
```

### `docs/` — 1.6 MB, **30 PNGs**, 4 markdown

```
 360  docs/pdfjs-research-notes.md
 224  docs/dashboard-recon.md          ** UNTRACKED **
 152  docs/settings-recon.md
 129  docs/testing-notes.md
      docs/density-screenshots/        8 PNGs (2026-07-13 density pass)
      docs/redesign-screenshots/      14 PNGs (2026-07-10/11 R1+R2)
      docs/income.png, docs/wallets.png, docs/settings.png,
      docs/*_straightFromClaudeInterface.png   (3)      — 6 loose PNGs in docs/ root
```

### `supabase/` — 6 files, all in `migrations/`. See §9.

### `.claude/`

```
  53  settings.json          (plugins + 3 hooks)
  64  scripts/guard-bash.cjs   53  scripts/format-edited.cjs
  32  agents/code-reviewer.md  37  agents/db-verifier.md
  55  skills/db-migration/SKILL.md      78  skills/design-check/SKILL.md
  46  skills/verify-merge/SKILL.md      34  skills/wrapup/SKILL.md
      settings.local.json    — present, ignored by the user's global gitignore
```

### `Cursus/` — 15 tracked files, ~620 KB

12 markdown chapters (36–627 lines) + `financieel-course.pdf` (402 KB) + `build.bat` +
`metadata.yaml`. Last touched 2026-06-12. `CLAUDE.md` marks its schema content OUTDATED.

### `test-fixtures/` — 5 files

`kbc-csv/monthly-export-01.csv` (27 KB, single CR-terminated line — hence the "0 lines" from
`wc -l`; it is not empty) and 4 KBC-mobile `.txt` extracts (428–542 bytes each).

### `public/`

`favicon.svg` (9.5 KB, referenced from `index.html`), `icons.svg` (5 KB, **no reference found**).

---

## 4. Routes

All routing lives in `src/App.jsx`. `ThemeContext` and `PrivacyContext` wrap everything; the
session gate is `supabase.auth.getSession()` + `onAuthStateChange`, and `settings.theme` is
re-fetched on every auth event.

| Path | Component | File | Notes |
|---|---|---|---|
| `/reset-password` | `ResetPassword` | `src/pages/ResetPassword.jsx:1` | Outside the shell. No table queries; `supabase.auth` only. |
| `/login` | `Login` | `src/pages/Login.jsx:1` | Outside the shell; redirects to `/` when a session exists. `supabase.auth` only. |
| `/` | `Dashboard` | `src/pages/Dashboard.jsx` | Standing + month performance + projection. Queries `wallets`, `transactions`, `income_entries`, `income_recurring`, `recurring_rules`, `income_distribution_rules`. Mounts `IncomeSpendingChart`, `CashTrendChart`, `ProjectedBalanceChart`, `UnallocatedConflictBanner`. **No RPC.** |
| `/wallets` | `Wallets` | `src/pages/Wallets.jsx` | Wallet grid + create/edit. Queries `wallets`, `transactions`, `recurring_rules`, `unallocated_plans`. Mounts `WalletModal`, `WalletCard`, `SummaryStrip`, `GhostAddCard`. Writes `wallets` (config columns only). |
| `/wallets/:id` | `WalletDetail` | `src/pages/WalletDetail.jsx` | The heaviest page (989 lines): three behaviours in one file — fixed, variable, and the Unallocated branch. Queries `wallets`, `transactions`, `recurring_rules`, `settings`, `unallocated_plans(+items)`, `unallocated_templates(+items)`. Mounts 13 components incl. `DistributionPopup`, `UnallocatedConflictBanner`, `RecurringRules`, `TransactionChecklist`, `PaymentHistory`, `VariableOverview/History`, `WalletTrendsChart`, `WalletModal`. RPC: `distribute_from_unallocated`. |
| `/income` | `Income` | `src/pages/Income.jsx` | Largest file (1225 lines): entries, recurring rules, templates, logging, editing. Queries 8 tables. RPC: `edit_income_distribution`. Mounts `DistributionPopup`, `IncomeConfirmModal`, `SummaryStrip`, `CompactRow`. |
| `/income/recurring/:id` | `IncomeRecurringDetail` | `src/pages/IncomeRecurringDetail.jsx` | One recurring income: schedule, version chain, its distribution, log-now. Queries `income_recurring`, `income_entries`, `income_distribution_rules`, `wallets`. Mounts `DistributionPopup`, `IncomeConfirmModal`. Has its own inline SVG chart. |
| `/import` | `Import` (**lazy**) | `src/pages/Import.jsx` | Code-split (`React.lazy`) because it pulls pdf.js. Two sources behind a toggle (CSV default / PDF). Queries 9 tables. RPC: `import_transactions`. Mounts `DistributionPopup`, `IncomeConfirmModal`. |
| `/budgeting` | `Budgeting` | `src/pages/Budgeting.jsx` | Multi-income plan control + flow diagram. Queries `income_recurring`, `income_distribution_rules`, `wallets`. Mounts `BudgetFlowChart`, `WalletTile`, `DistributionEditor`, `WalletModal`. **No RPC** — writes rules and wallet config directly. |
| `/settings` | `Settings` | `src/pages/Settings.jsx` | Account / preferences / danger zone. Queries `settings` + `supabase.auth`. RPC: `reset_user_data`. |

No `NotFound` route: `/*` inside the shell falls through to nothing rendered.

---

## 5. `src/components/` — every file

**Shared primitives** (`src/components/ui/`, enforced by design-check: "re-implementing one inline
per page is a violation"):

| File | Lines | Purpose |
|---|--:|---|
| `ui/PageHeader.jsx` | 48 | The one page header. Title 26px, optional eyebrow/icon/meta/actions, closing hairline. |
| `ui/SummaryStrip.jsx` | 32 | Segmented stat bar under a header; also exports `StatCell`. |
| `ui/CompactRow.jsx` | 34 | 28px chip + name + 11px meta + right value; used inside one card with `divide-y`. |
| `ui/GhostAddCard.jsx` | 15 | Dashed "add" placeholder filling a grid remainder. |
| `ui/MetricBar.jsx` | 13 | 5–6px progress bar, clamped 0–100%. |
| `ui/CardFooterMeta.jsx` | 10 | 11px muted footer line pinned with `mt-auto`. |

**Feature-specific, `src/components/budgeting/`:**

| File | Lines | Purpose |
|---|--:|---|
| `BudgetFlowChart.jsx` | 141 | One inline-SVG income→wallet flow diagram for all included incomes. Geometry from `lib/budgetFlowLayout`. |
| `DistributionEditor.jsx` | 195 | Per-income distribution editor with funding bars aggregated across incomes. |
| `WalletTile.jsx` | 50 | Compact wallet tile for the Budgeting rail (explicit exception to §8 Rule 1). |

**Feature-specific, `src/components/` root:**

| File | Lines | Purpose |
|---|--:|---|
| `DistributionPopup.jsx` | 465 | The distribution modal. Used by Income, IncomeRecurringDetail, WalletDetail (outbound) and Import. Saves income templates. |
| `PaymentHistory.jsx` | 458 | Fixed-wallet payment history; edits amount (reverses via RPC pair) and renames a cost. |
| `RecurringRules.jsx` | 454 | Recurring **expense** rule CRUD for a wallet, incl. amount re-versioning. |
| `VariableHistory.jsx` | 319 | Variable-wallet transaction history + edit (RPC reverse/apply). |
| `WalletModal.jsx` | 306 | Create/edit wallet: type, budget type, budget, icon, cap fields. Emits a payload with **no `balance` key**. |
| `VariableOverview.jsx` | 254 | Variable-wallet month overview; can credit back via RPC. |
| `UpcomingPayments.jsx` | 250 | Upcoming recurring payments list (pure render over `recurringUtils`). |
| `TransactionChecklist.jsx` | 179 | Tick off a due recurring expense → inserts a transaction + `decrement_wallet_balance`. |
| `VariableTransactionForm.jsx` | 176 | Add/edit a variable spend; RPC increment+decrement on edit. |
| `WalletTrendsChart.jsx` | 155 | Inline-SVG wallet balance trend; queries its own data. |
| `UnallocatedConflictBanner.jsx` | 151 | Pending multi-plan conflict banner + Apply/Dismiss. Mounted on Dashboard and WalletDetail. |
| `WalletCard.jsx` | 130 | Density-pass wallet card (hero + bar + caption + footer). |
| `VariableTransactionList.jsx` | 122 | Month list of variable spends; delete reverses via RPC. |
| `ProjectedBalanceChart.jsx` | 117 | Inline-SVG projection chart. |
| `Layout.jsx` | 100 | App shell: sidebar nav, privacy toggle, sign-out. |
| `IncomeSpendingChart.jsx` | 92 | Inline-SVG income-vs-spending bars. |
| `CashTrendChart.jsx` | 76 | Inline-SVG cash trend. |
| `SalaryGrowthChart.jsx` | 58 | Inline-SVG salary-growth line over a rule's version chain. |
| `IncomeConfirmModal.jsx` | 37 | Generic confirm modal. |

---

## 6. `src/lib/` — every file in detail

Column key: **Pure** = no imports of `supabase`, no `Date` reads, no DOM. **`now`?** = does it read
`new Date()` / `Date.now()` **without** an injectable parameter.

### 6.1 Non-import modules

| File | Lines | Pure | Tests | `now`? |
|---|--:|---|--:|---|
| `supabase.js` | 10 | no (client) | 0 | no |
| `format.js` | 47 | yes (module-level privacy flag) | 15 | no |
| `walletIcons.js` | 50 | yes (React element factory) | 0 | no |
| `resolveCappedInflow.js` | 28 | **yes** | 3 | no |
| `resolveDistribution.js` | 55 | **yes** | 18 | no |
| `budgetPlan.js` | 175 | **yes** | 20 | no |
| `budgetFlowLayout.js` | 237 | **yes** | 15 | no |
| `walletMetrics.js` | 67 | yes | 12 | no — injectable `now` |
| `incomeMetrics.js` | 53 | yes | 9 | no — injectable `now` |
| `recurringUtils.js` | 172 | yes | 10 | partly — dates derive from `rule.*`, but `generateUpcomingDates` takes `fromDate` |
| `dashboardCalcs.js` | 268 | yes | 6 | 🚩 **YES** — see below |
| `distributeIncome.js` | 64 | **no — writes** | 11 (mocked) | no |
| `unallocatedPlans.js` | 111 | **no — writes** | 13 (mocked) | no |
| `recurringAmountUpdate.js` | 111 | **no — writes** | **0** | 🚩 yes (`todayStr()`) |
| `PrivacyContext.jsx` | 3 | context only | 0 | no |
| `ThemeContext.jsx` | 3 | context only | 0 | no |

**Exports:**

- **`supabase.js`** — `supabase` (the client, from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`);
  `getCurrentUserId(): Promise<string|null>` reads the session user id.
- **`format.js`** — `setPrivacy(on)` flips a module-level flag; `formatMoney(amount, {decimals=2,
  privacy})` → `€ 1.234,56` / `−€ …` (U+2212), masks to `€ ••••`; `formatMoneyCompact(value,
  {privacy})` → `€500` / `€1.5k`, masks to `€••`. Hand-rolled, not `Intl`, deliberately.
- **`walletIcons.js`** — `WALLET_ICONS` (12 lucide icons), `ICON_CHOICES`,
  `defaultIconForType(type)`, `walletIcon(wallet)`, `WalletIcon({wallet, ...props})`.
- **`resolveCappedInflow.js`** — `resolveCappedInflow({balance, amount, max, rate})` →
  `{received, overflow}`. Fill to ceiling at 100%, reduce the excess to `rate`; `overflow` derived
  from the rounded `received` so the pair sums to `amount` exactly.
- **`resolveDistribution.js`** — `resolveRowExact(mode, value, base)` (unrounded per-row primitive,
  shared with `unallocatedPlans.firePlan`); `resolveDistribution(rows, total, {sendRemainder,
  unallocatedWalletId})` → `{explicit, distributed, remainder, complete, notOver, remainderRow,
  allRows, distributions}`. Percentages are of the **total**, never the remainder.
- **`budgetPlan.js`** — `isMustFund(w)`, `isFreePool(w)`, `computeWalletFunding({wallets,
  allocations})`, `fundToBudget({wallet, incomeId, incomeAmount, allocations})`,
  `resolveIncomeEdit({income, editableWallets, edits, unallocatedWalletId})`,
  `buildBudgetPlan({incomes, rulesByIncome, wallets})`, `autoFillSingle({income, wallets,
  unallocatedWalletId})`, `buildRuleRows({incomeAmount, allocations, existingRules,
  unallocatedWalletId})`.
- **`budgetFlowLayout.js`** — `computeBudgetFlowLayout({...})` → node rects, ribbon paths,
  de-collided label positions. All geometry; the component renders only what this returns.
- **`walletMetrics.js`** — `walletsSummary(wallets)`, `walletActivityThisMonth(walletId,
  transactions, now = new Date())`, `nextPaymentDue(recurringRules, walletId, now = new Date())`.
- **`incomeMetrics.js`** — `incomeSummary(entries, now = new Date())`, `recurringDueState(rule,
  entries, now = new Date())`.
- **`recurringUtils.js`** — `generatePaymentDates(rule, upToDate)`, `generateUpcomingDates(rule,
  fromDate, count = 15)`, `formatFrequency(frequency)`. Handles daily/weekly/monthly/quarterly/
  yearly/custom.
- **`dashboardCalcs.js`** — 10 exports: `calculateProjectedCash`, `calculateMonthOutlook`,
  `getProjectedBalanceTimeline` (`daysAhead = 30`), `getOverduePayments`, `getOverspentWallets`,
  `calculateMonthMetrics`, `getMonthlyAverage`→`calculateMonthlyAverage`, `getUnderfundedWallets`,
  `getHistoricalSeries`, `getYearlySeries`.
  🚩 **`new Date()` is read internally at lines 32, 76, 125, 163 with no injectable `now`** — the
  only lib module in the "metrics" family that is not parameterised, which is why it has 6 tests
  against `walletMetrics`' 12 for a third of the code. `docs/testing-notes.md` records this as a
  deliberate deferral and `PHASE-ROADMAP.md` Phase 2 makes fixing it a requirement.
- **`distributeIncome.js`** — `distributeIncome({distributions, wallets, unallocatedWalletId,
  sourceName, date, isAutomated = false, userId, incomeEntryId = null, importFingerprint = null})`.
  The "dumb executor": per distribution row it calls `increment_wallet_balance` and accumulates a
  `transactions` row; for `isAutomated` + `budget_type === 'capped'` it routes through
  `resolveCappedInflow` and credits the overflow target (`overflow_wallet_id` else Unallocated).
  Batch-inserts all transaction rows at the end.
- **`unallocatedPlans.js`** — `planAmount(plan, balance)`; `firePlan(unallocatedWalletId, plan,
  balance)` (resolves items, refuses a split that does not fully allocate — `unallocatedPlans.js:44`
  — then calls `distribute_from_unallocated`); `fetchPendingConflict()`;
  `evaluateUnallocatedPlans(unallocatedWalletId)` (check-on-change: 1 eligible → fire, >1 → persist
  a `unallocated_pending_conflicts` row and stall, 0 → nothing).
- **`recurringAmountUpdate.js`** — `updateRecurringAmount(rule, amount)` (archive + successor with
  `parent_rule_id`, restoring the archive if the insert fails) and
  `saveRecurringDistribution(incomeRecurringId, ruleRows)`. **Zero tests** despite being described
  in its own header as "the ONE definition of that write".

### 6.2 `src/lib/import/` — all pure except `extractText.js`

| File | Lines | Pure | Tests | Exports |
|---|--:|---|--:|---|
| `types.js` | 38 | n/a | 0 | JSDoc typedefs only (`export {}`) |
| `textLayout.js` | 48 | yes | 9 | `itemsToLines(items, {yTolerance, spaceGap})` |
| `extractText.js` | 64 | **no** — pdf.js | 0 | `extractText(file)`. The single impure edge; carries the `?url` worker import and a warning not to replace it. |
| `detectBank.js` | 35 | yes | 4 | `ADAPTERS` (**`[kbc]` — the PDF adapter only**), `SUPPORTED_BANKS`, `detectBank(text, {preferredBank})` |
| `normalize.js` | 131 | yes | 20 | `parseKbcAmount`, `parseKbcDate` (DD-MM-YYYY), `parseKbcCsvDate` (dd/mm/yyyy), `parseIbanLine`, `counterpartyKey` |
| `csv.js` | 72 | yes | 14 | `parseDelimited(text, delimiter = ';')` — hand-rolled RFC 4180 |
| `dedupe.js` | 97 | yes | 19 | `fingerprintOf(tx)`, `flagDuplicates(rows, existingFingerprints, {batchScope})` |
| `suggestWallet.js` | 71 | yes | 13 | `suggestWallet(tx, {mappings, wallets})` — learned layer + conservative cold start |
| `banks/kbc.js` | 206 | yes | 26 (`kbc.test.js`) | `BANK_ID`, `BANK_LABEL`, `FORMAT_ID='kbc-mobile-export'`, `detect(text)`, `parse(text)` |
| `banks/kbcCsv.js` | 312 | yes | 26 (`kbcCsv.test.js`) | same shape, `FORMAT_ID='kbc-csv-export'` |
| `buildRows.js` | 153 | yes | 18 | `buildRows`, `decorateRows`, `shouldInclude`, `isRecurringHandled`, `toCommitItems`, `toIncomeRows`, `isIncomeRow` |
| `buildCsvRows.js` | 216 | yes | 28 | `buildCsvRows`, `unansweredRecurring`, `toLinkUpserts`, `toRuleAmountUpdates` |
| `matchRecurring.js` | 286 | yes | 19 | `matchRecurring(rows, ctx)` |
| `reconcile.js` | 104 | yes | 9 | `reconcile(statement, ctx)` — chain + total, both **soft** |
| `monthlySnapshots.js` | 110 | yes | 9 | `deriveSnapshots(statement)`, `balanceBefore(statement, boundaryDate)` |

Note: `banks/kbcCsv.js` is deliberately **not** in the `detectBank` registry — `buildCsvRows.js`
calls it directly because the source is an explicit user choice on the page.

---

## 7. Rule-compliance greps (real hits)

### 7.1 Rule 1 — no client-side `wallets.balance` writes → **CLEAN**

Every `wallets` write is a config update or an insert:

- `src/pages/Wallets.jsx:43` `update(values)` / `:46` `insert({...values, user_id})`
- `src/pages/WalletDetail.jsx:280` `update(values)`
- `src/pages/Budgeting.jsx:139` `update(values)`

All four take `values` from `WalletModal`'s payload, built at `src/components/WalletModal.jsx:79-83`
as `{name, type, budget_type, budget, colour, icon, sort_order}` plus, for capped wallets,
`{cap_max, cap_reduction_rate, overflow_wallet_id}`. **No `balance` key.** Balance is read
client-side in two places (`src/components/UnallocatedConflictBanner.jsx:61`,
`src/lib/unallocatedPlans.js:76`) and only fed back into an RPC.

**Latent risk, not a violation:** all three writes pass the modal payload through by spread. If a
future field named `balance` ever entered that payload it would be written directly, with nothing
in the code preventing it.

### 7.2 Every `supabase.rpc(` call site — 20 hits, 6 distinct functions

| Function | Call sites |
|---|---|
| `increment_wallet_balance` | `PaymentHistory.jsx:108` · `VariableHistory.jsx:89` · `VariableOverview.jsx:66` · `VariableTransactionForm.jsx:47` · `VariableTransactionList.jsx:35` · `distributeIncome.js:19`, `:37`, `:45`, `:53` |
| `decrement_wallet_balance` | `PaymentHistory.jsx:109` · `TransactionChecklist.jsx:72` · `VariableHistory.jsx:90` · `VariableTransactionForm.jsx:48`, `:60` · `VariableTransactionList.jsx:39` |
| `distribute_from_unallocated` | `unallocatedPlans.js:50` · `WalletDetail.jsx:715` |
| `import_transactions` | `Import.jsx:398` |
| `edit_income_distribution` | `Income.jsx:1175` |
| `reset_user_data` | `Settings.jsx:225` |

### 7.3 Rule 2 — every insert stamps `user_id` → **CLEAN** (26 insert sites checked individually)

Child-row inserts (`income_template_distribution_items`, `unallocated_template_items`,
`unallocated_plan_items`, `income_distribution_rules`) each map `user_id: userId` onto every row.
`RecurringRules.jsx:131,136` inserts `payload`, which is built with `user_id: userId` at
`RecurringRules.jsx:96`. `distributeIncome.js` stamps `user_id` on every accumulated transaction
row. `recurringAmountUpdate.js:63` uses `current.user_id ?? userId`.

### 7.4 `indigo|purple|violet` → **1 hit, not a violation**

`src/pages/Settings.jsx:41` — a comment reading "No purple."
**But** `DESIGN-SPEC.md` §2 itself lists a `purple #EEEDFE / #534AB7 (bar #7F77DD)` wallet-identity
ramp, and `.claude/skills/design-check/SKILL.md:24` names `#7F77DD` as a required flow-diagram
stop, so "no purple" and "purple is a spec colour" both hold in different scopes.

### 7.5 `font-bold` / `font-semibold` → **0 hits anywhere in `src/`**

### 7.6 Money formatting bypassing `formatMoney()` → **effectively clean**

21 `toFixed` hits. 19 are arithmetic (`round2` helpers) or non-money percentages
(`Dashboard.jsx:314` savings-rate `%`, `Dashboard.jsx:401` `pp` delta, `WalletDetail.jsx:361`
`pct.toFixed(0)%`), plus `format.js` itself. **No amount is rendered via inline `toFixed`.**

🚩 The identical helper `const round2 = n => Number(Number(n).toFixed(2))` is **copy-pasted in 8
files**: `DistributionPopup.jsx:8`, `budgeting/DistributionEditor.jsx:17`, `budgetFlowLayout.js:9`,
`budgetPlan.js:15`, `resolveDistribution.js:9`, `unallocatedPlans.js:4`, `Budgeting.jsx:16`,
`WalletDetail.jsx:23`, and again as a `function` at `Income.jsx:35`.

### 7.7 Raw Tailwind palette instead of design tokens → **4 hits, all in one file**

`src/App.jsx` is the only file using non-token colours:

- `src/App.jsx:71` — `bg-gray-50 dark:bg-gray-950` on the loading screen (spec: `bg-cream`)
- `src/App.jsx:72` — `text-gray-400`
- `src/App.jsx:84` — `bg-green-500 text-white` on the welcome banner (spec: `positive` tokens)

Every other file in `src/` uses only token utilities.

### 7.8 Chart libraries → **none imported**. 7 files render inline `<svg>`. Compliant.

---

## 8. `TODO` / `FIXME` / `HACK` / `XXX` / `KNOWN` — complete, verbatim

Across the whole repo (excluding `node_modules`, `Cursus/`, `package-lock.json`) there is **exactly
one** such marker, plus one false positive.

**`src/pages/Income.jsx:245-251`** — the only real one:

```
          // KNOWN PRE-EXISTING ISSUE (flagged, intentionally not fixed here):
          // Editing the amount here updates only the income_entries row — it does NOT
          // re-run distribution, so the wallet credits no longer sum to the new amount,
          // leaving the income and its distribution desynced. Follow-up: route amount
          // changes on a distributed income through the distribution editor (which
          // reverses + reapplies credits via the transactional RPC) so they can't desync.
```

**False positive:** `src/lib/import/kbc.test.js:128` — `expect(t.counterpartyBic).toBe('KREDBEBBXXX')`
(the `XXX` is part of a BIC).

Two other in-code deferrals worth recording though they carry no marker word:

- `src/lib/unallocatedPlans.js:49` — `// HOOK: Stage 4e will log plan firings here.` (no logging built)
- `src/lib/import/detectBank.js:8` — `ADAPTERS = [kbc]`, one adapter registered.

---

## 9. `supabase/migrations/` — 6 files

The header block of every file records purpose / date / feature / impact / rollback, per the
`db-migration` skill.

| File | Date | Purpose | Applied? |
|---|---|---|---|
| `20260709092500_reset_user_data.sql` (71) | 2026-07-09 | `reset_user_data(p_full boolean)` — two-tier transactional reset replacing a client path that wrote `wallets.balance` directly. | `PROJECT-CONTEXT.md` §4 states verified live (seed→clear→full under a real test session). Not re-verified here. |
| `20260717134100_wallets_cap_max_gte_budget.sql` (15) | 2026-07-17 | CHECK: a capped wallet's `cap_max` ≥ its `budget`. | Header itself says "Verified read-only on 2026-07-17: zero existing rows violate it". |
| `20260717140000_income_recurring_include_in_budget.sql` (13) | 2026-07-17 | `income_recurring.include_in_budget` bool NOT NULL default true. | §6 states "owner-applied & verified 2026-07-19". |
| `20260726120000_import_schema.sql` (107) | 2026-07-26 | `settings.bank_provider` + CHECK; `transactions.import_fingerprint` + partial index; tables `counterparty_wallet_mappings` (unique on `(user_id, counterparty_key)`) and `imported_statements`; RLS + 4 policies each. | §4 heading says "applied & verified". |
| `20260726120100_import_transactions_rpc.sql` (130) | 2026-07-26 | `import_transactions(p_items jsonb)` — validate-all-then-write batch commit, SECURITY INVOKER, `search_path=''`. | §4 says "Applied & verified live 2026-07-26". |
| `20260730120000_csv_import_schema.sql` (132) | 2026-07-30 | Tables `recurring_import_links` + `monthly_balance_snapshots`, 2 unique indexes, RLS + 4 policies each. | §6 says "**APPLIED & VERIFIED 2026-07-30**"; §4's own heading still says "**NOT applied yet**". See `DISCREPANCIES.md` D-01. |

**Nothing in the repo applies these.** There is no migration runner, no `supabase db push`, no CI
step. Applying is a manual owner action.

🚩 **The folder is not a schema history.** It starts at 2026-07-09. The base schema — `wallets`,
`transactions`, `income_entries`, `income_recurring`, `income_templates`, `recurring_rules`,
`budget_allocations`, `settings`, the four `unallocated_*` tables,
`unallocated_pending_conflicts`, `income_distribution_rules`,
`income_template_distribution_items`, the `handle_new_user()` signup trigger, and the RPCs
`increment_wallet_balance` / `decrement_wallet_balance` / `edit_income_distribution` /
`distribute_from_unallocated` — has **no file at all**. `PROJECT-CONTEXT.md` §4 states this
explicitly and correctly.

---

## 10. Tests

`npm test` → **exit 0**.

```
 Test Files  24 passed (24)
      Tests  352 passed (352)
   Duration  14.02s
```

| Test file | `it()` | Covers |
|---|--:|---|
| `import/buildCsvRows.test.js` | 28 | CSV batch assembly, per-file isolation, link upserts, rule-amount updates |
| `import/kbc.test.js` | 26 | KBC mobile PDF adapter (incl. the split-superscript-currency case) |
| `import/kbcCsv.test.js` | 26 | KBC export CSV adapter against the real 42-row fixture |
| `import/normalize.test.js` | 20 | amount/date/IBAN/counterparty normalizers |
| `budgetPlan.test.js` | 20 | funding model, auto-fill, rule-row building |
| `import/dedupe.test.js` | 19 | fingerprints + duplicate flagging |
| `import/matchRecurring.test.js` | 19 | recurring-link matching |
| `import/buildRows.test.js` | 18 | PDF batch assembly, include/commit predicates |
| `resolveDistribution.test.js` | 18 | %/€ resolution, remainder sweep, rounding |
| `budgetFlowLayout.test.js` | 15 | flow geometry, min thickness, label de-collision |
| `format.test.js` | 15 | money formatting + privacy masking |
| `import/csv.test.js` | 14 | RFC 4180 tokenizer |
| `import/suggestWallet.test.js` | 13 | learned + cold-start suggestion |
| `unallocatedPlans.test.js` | 13 | eligibility, firing, conflict stall (supabase mocked) |
| `walletMetrics.test.js` | 12 | wallet summary/activity/next-due |
| `distributeIncome.test.js` | 11 | executor incl. capped routing (supabase mocked) |
| `recurringUtils.test.js` | 10 | all six frequencies |
| `import/monthlySnapshots.test.js` | 9 | boundary derivation |
| `import/reconcile.test.js` | 9 | chain + total soft checks |
| `import/textLayout.test.js` | 9 | pdf.js item → line reconstruction |
| `incomeMetrics.test.js` | 9 | income summary + due state |
| `dashboardCalcs.test.js` | **6** | a subset of 10 exports over 268 lines |
| `import/detectBank.test.js` | 4 | routing + preference tiebreak |
| `resolveCappedInflow.test.js` | 3 | cap fill/reduce/overflow |

**No coverage at all:**

| Module | Lines | Why it matters |
|---|--:|---|
| `src/lib/recurringAmountUpdate.js` | 111 | 🚩 Writes to the DB, re-versions rules, has a failure-restore path. Its own header calls it "the ONE definition of that write". |
| `src/lib/import/extractText.js` | 64 | Documented as untestable in the node env (pdf.js + `?url`). |
| `src/lib/walletIcons.js` | 50 | Trivial mapping. |
| `src/lib/supabase.js` | 10 | Client construction. |
| `src/lib/import/types.js` | 38 | JSDoc only. |
| `src/lib/PrivacyContext.jsx`, `ThemeContext.jsx` | 3 each | Context declarations. |

**Nothing under `src/pages/` or `src/components/` is tested** — `vitest.config.js` sets
`include: ['src/**/*.test.js']` (`.js` only, so a `.test.jsx` would not even be collected) and
`environment: 'node'`, deliberately, per its own header comment.

CI (`.github/workflows/test.yml`) runs on `pull_request` and pushes to `main`: Node 22, `npm ci`,
**`npm test` only**. It does **not** run `npm run build` or `npm run lint`.

---

## 11. Build health

### `npm run build` → **exit 0, PASS**

```
✓ 2159 modules transformed. built in 2.41s
dist/index.html                            0.46 kB │ gzip:   0.29 kB
dist/assets/pdf.worker.min-DEtVeC4l.mjs 1,255.06 kB
dist/assets/index-BheyeP4z.css            40.45 kB │ gzip:   7.93 kB
dist/assets/Import-DujpS6Bn.js           467.26 kB │ gzip: 139.59 kB
dist/assets/index-CZ53FKXW.js            732.33 kB │ gzip: 190.24 kB
```

**1 warning:** chunks over 500 kB (the main bundle at 732 kB and the pdf worker at 1.26 MB). The
`Import` route is already code-split; the 732 kB main chunk is not.

### `npm run lint` → **exit 1, FAIL**

**44 problems — 33 errors, 11 warnings — across 19 files.** Rule breakdown:

| Rule | Count | Severity |
|---|--:|---|
| `no-unused-vars` | 12 | error |
| `react-hooks/static-components` ("Cannot create components during render") | 11 | error |
| `react-hooks/exhaustive-deps` | 11 | warning |
| `react-hooks/immutability` ("Cannot access variable before it is declared") | 6 | error |
| `react-hooks/set-state-in-effect` ("setState synchronously within an effect… cascading renders") | 4 | error |

Per file: `Income.jsx` 5 · `recurringUtils.js` 5 · `PaymentHistory.jsx` 5 · `Dashboard.jsx` 4 ·
`VariableHistory.jsx` 4 · `DistributionPopup.jsx` 3 · `Settings.jsx` 2 · `WalletTrendsChart.jsx` 2 ·
`WalletModal.jsx` 2 · `VariableOverview.jsx` 2 · `RecurringRules.jsx` 2 · `WalletDetail.jsx` 1 ·
`Login.jsx` 1 · `IncomeRecurringDetail.jsx` 1 · `VariableTransactionList.jsx` 1 ·
`VariableTransactionForm.jsx` 1 · `UnallocatedConflictBanner.jsx` 1 · `TransactionChecklist.jsx` 1 ·
`App.jsx` 1.

`PROJECT-CONTEXT.md` §6 describes this count as expected ("44 pre-existing problems, 0 new"), so
the failure is known — but `npm run lint` is a documented project command that has been red for at
least a release cycle, and CI does not run it.

---

## 12. Live-database verification — NOT PERFORMED

The `plugin:supabase:supabase` MCP starts each session unauthenticated; the OAuth flow was
initiated in this session but not completed, so no query ran against project
`duyttdjfvblhhjihybal`.

Consequences for this artefact:
- Every schema statement in §9 is sourced from migration files and code, not the live DB.
- `DISCREPANCIES.md` D-01 (CSV tables applied or not) is resolvable only by a live query.
- Two further checks are left undone: whether `unallocated_pending_conflicts` exists with the
  shape `unallocatedPlans.js:103` writes, and whether `wallets.cap_reduction_enabled` (documented
  as a dead column) still exists.

Also unavailable this session: the **GitHub MCP** (`400: Authorization header is badly formatted`)
and **Playwright MCP** (`CONNECT_TIMEOUT`). The `gh` CLI substituted for the former; no browser
verification was attempted or needed.

---

## 13. `DESIGN-SPEC.md` — sections and the complete token tables

237 lines, last modified 2026-07-26. Opens: "Locked design language, approved by the owner on
2026-07-09 after mockup iteration (direction B structure × direction C warmth)."

| § | Heading | Summary |
|---|---|---|
| 1 | Principles | The "blend": direction B structure with direction C warmth. Restraint over decoration; two font weights only. |
| 2 | Color tokens | Light "cream" palette and dark palette as hex tables, plus a rule of thumb for unlisted colours and the five wallet-identity ramps. |
| 3 | Typography | Hero 36px `font-medium tracking-tight`; card numbers 15–20px; section labels 11–12px uppercase `tracking-wider`; body 13–14px. **Never `font-bold`/`font-semibold` on numbers. Two weights total: 400 and 500.** |
| 4 | Components | Per-component rules: PageHeader, cards, buttons, icon chips, progress bars, modals, empty states. |
| 5 | Money formatting (rollout requirement) | All euro display goes through `formatMoney()`; `€ 1.234,56`, U+2212 minus, normal space after `€`. |
| 6 | Charts | Inline SVG only; a chart-library import is a violation. |
| 7 | design-check table | The table that replaces the one in `.claude/skills/design-check/SKILL.md`. 19 rows. |
| 8 | Density & completeness patterns | Locked 2026-07-13. Rule 1 content cards (hero + MetricBar + caption + CardFooterMeta, no empty bottom half), summary strips, tables, CompactRow, Settings layout, GhostAddCard, shared-primitive enforcement. |

### §2 Light mode ("cream") — verbatim

| Token | Hex | Use |
|---|---|---|
| `cream` (page bg) | `#F4F0E7` | page canvas |
| `card` | `#FFFFFF` | all cards/surfaces |
| `card-border` | `#E4DFD3` | 0.5–1px card hairlines |
| `inner-border` | `#ECE7DB` | dividers/nested-card borders inside cards |
| `field` | `#F7F4EC` | input backgrounds |
| `track` | `#F1EFE8` | progress-bar tracks |
| `ink` (text primary) | `#2C2C2A` | headings, numbers, primary buttons bg |
| `ink-soft` (secondary) | `#5F5E5A` | secondary text |
| `ink-muted` | `#888780` | labels, captions |
| `ink-faint` | `#B4B2A9` | hints (e.g. budget hints) |
| `accent` (coral) | `#D85A30` | logo mark, accent highlights, Unallocated amounts, active checkbox |
| `positive` | `#3B6D11` | positive amounts/text; bars use `#639922` |
| `positive-tint` | `#EAF3DE` | positive chip/badge backgrounds |
| `negative` | `#993C1D` | negative/spent icons & text (deep red-clay); `#A32D2D` allowed for strict error text |
| `negative-tint` | `#FAECE7` | negative chip backgrounds |

### §2 Dark mode (direction B palette) — verbatim

| Token | Hex | Use |
|---|---|---|
| page bg | `#14140F` | canvas; also nested-card bg inside cards |
| card | `#1E1E17` | cards/surfaces (separation by fill, not border; borders may be dropped or `#2C2C2A`) |
| track | `#2C2C2A` | progress tracks |
| text primary | `#F1EFE8` | |
| text secondary | `#B4B2A9` | |
| text muted | `#888780` | |
| accent text | `#F0997B` | coral shifted lighter for contrast; solid fills keep `#D85A30` |
| positive text | `#97C459` | shifted lighter (was #3B6D11 — too dark on black) |
| positive badge | bg `rgba(99,153,34,0.18)`, text `#97C459` | |
| negative text | `#F09595` | shifted lighter |
| negative badge | bg `rgba(226,75,74,0.15)`, text `#F09595` | |

### §2 Wallet identity ramps — verbatim

> Each wallet gets a color family: chip bg = pastel stop, icon/bar = strong stop.
> Light: green `#EAF3DE`/`#3B6D11` (bar `#639922`), blue `#E6F1FB`/`#185FA5` (bar `#378ADD`), pink
> `#FBEAF0`/`#993556` (bar `#D4537E`), purple `#EEEDFE`/`#534AB7` (bar `#7F77DD`), amber
> `#FAEEDA`/`#854F0B` (bar `#EF9F27`).
> Dark: chip bg = same hue at ~18% alpha; icon = the bar stop or lighter.
> Map existing wallet `colour` values onto these families; do not invent new hues.

### §7 design-check table — verbatim (19 rows)

| Element | Required |
|---|---|
| Page background | `cream #F4F0E7` (dark `#14140F`) |
| Page header | `PageHeader` from `src/components/ui/` — title 26px `font-medium tracking-tight`, bottom hairline `card-border`. A bare `<h1>` on a page is a violation (auth pages excepted) |
| Page subtitles | header `meta` carries short factual data only. Explanatory/instructional prose in a page header is a violation |
| Empty states | no card, centred both axes on the page bg, `ink-muted` headline + `ink-faint` support line. A boxed empty-state card is a violation |
| Metric tiles | `rounded-[11px] border border-inner-border`, one 18px number, 11px support, no bar. Explicit exception to §8 Rule 1; free-pool tiles show an amount, never a fabricated % |
| Flow diagrams | one colour per source from the §2 ramp stops; neutral destination nodes; coral Unallocated; min ribbon thickness; de-collided labels; geometry in a tested `src/lib/` function |
| Cards | white, 0.5–1px `#E4DFD3` border, `rounded-[14px]` (dark `#1E1E17`, fill-separated) |
| Hero numbers | 36px `font-medium tracking-tight` — bold/semibold on numbers is a violation |
| Section labels | 11–12px uppercase `tracking-wider` `#888780` |
| Accent | coral `#D85A30` (dark text-accents `#F0997B`) |
| Positive / negative text | light `#3B6D11` / `#993C1D`; dark `#97C459` / `#F09595` |
| Primary buttons | bg `#2C2C2A` white text (dark inverted) |
| Icon chips | pastel bg + strong icon from the same ramp |
| Progress bars | 5–6px, track `#F1EFE8`/`#2C2C2A` |
| Charts | inline SVG only — chart library import is a violation |
| Icons | lucide-react only |
| Dark mode | every element ships both themes; dark uses lighter text stops, alpha tints, fill separation |
| Money rendering | via `formatMoney()` — inline `toFixed` on amounts is a violation |
| Budget hints | grey hint only for fixed/capped wallets with non-zero budget; never render "€ 0" |

**Implementation check:** `src/index.css` defines all 15 light tokens in `@theme` plus three the
spec table does not name (`--color-accent-solid`, `--color-positive-bar`, `--color-negative-bar`,
`--color-warning: #EF9F27`), and overrides the right subset in `.dark`. The values match the spec
exactly. `.claude/skills/design-check/SKILL.md` carries the §7 table **plus one extra row**
("Interactive controls — toggles/switches, active states, focus rings use ink or coral;
`indigo`/`purple`/`violet` anywhere is a violation") that does not appear in `DESIGN-SPEC.md` §7,
and a second table for the §8 density rules.

---

## 14. Every `.md` in root and `docs/`

| File | Lines | One line |
|---|--:|---|
| `CLAUDE.md` | 112 | Project rules for Claude Code: ground-truth hierarchy, commands, stack, hooks, 7 non-negotiables, design system, workflow. |
| `PROJECT-CONTEXT.md` | 908 | The master context. §4 schema, §5 features, §6 current standing, §7 decision log, §8 gotchas, §9 companion files. |
| `DESIGN-SPEC.md` | 237 | The locked design language. See §13. |
| `PHASE-ROADMAP.md` | 110 | **UNTRACKED.** Five remaining phases with kickoff prompts + a parked list. |
| `ARCHITECTURE.md` | 21 | A retirement notice. "This file is retired as a source of truth… they were wrong in ways that caused real incidents when trusted." Still referenced by 9 files. |
| `README.md` | 16 | The stock Vite + React template README. Never edited. |
| `budgeting-page-plan.md` | 647 | Authoritative record for the Budgeting feature, incl. §4.2 the capped-wallet mechanic. |
| `pdf-import-plan.md` | 337 | PDF bank-statement import phase plan (shipped, PR #17). |
| `kbc-adapter-spec.md` | 183 | KBC mobile-export PDF layout spec derived from a real anonymized statement. |
| `kbc-csv-import-background.md` | 142 | KBC export-CSV format facts. Background only — points at a companion `kbc-csv-import-instructions.md` **that does not exist**. |
| `distribution-unallocated-plan.md` | 121 | Distribution + Unallocated outbound phase plan. Self-describes as "the ACTIVE phase". |
| `testing-setup-plan.md` | 104 | Vitest + CI setup handoff (shipped, PR #4). |
| `encryption-with-key-plan.md` | 159 | Client-side encryption handoff, two open discussions unresolved. |
| `backup-restore-feature-plan.md` | 85 | Backup/restore handoff. Predates the two-tier reset and the redesign. |
| `docs/pdfjs-research-notes.md` | 360 | pdf.js survey. Header still says "research only, nothing installed, no code written" — the feature shipped. |
| `docs/dashboard-recon.md` | 224 | **UNTRACKED.** Read-only dashboard inventory for the Phase-2 redesign chat. |
| `docs/settings-recon.md` | 152 | Settings-page recon (consumed by PR #6). |
| `docs/testing-notes.md` | 129 | Testing-phase decisions incl. the `now`-parameter deferral. |

---

## 15. `.claude/` configuration

**`settings.json`** — `extraKnownMarketplaces: claude-plugins-official`; `enabledPlugins`:
`supabase`, `playwright`, `frontend-design`, `code-review`, `github`, `context7`,
**`typescript-lsp`** (the last three-plus not all named in `CLAUDE.md`'s first-time-setup list,
which mentions only `context7`, `supabase`, `playwright`, `github`).

Hooks:
- **PreToolUse / Bash** → `node .claude/scripts/guard-bash.cjs` (64 lines). Deterministically
  blocks force-push, push to `main`, recursive force-delete, `npm audit fix --force`, destructive
  SQL, hard reset/clean.
- **PostToolUse / Edit|Write|MultiEdit** → `node .claude/scripts/format-edited.cjs` (53 lines).
  `eslint --fix` on edited `.js`/`.jsx`, non-blocking.
- **Stop** → `npm test --silent`.

**Agents:** `code-reviewer.md` (32 lines, tools Read/Grep/Glob/Bash, reviews the diff against the
project's hard rules) and `db-verifier.md` (37 lines, read-only, tools
`mcp__plugin_supabase_supabase__list_tables` + `execute_sql`, `mcpServers: [plugin_supabase_supabase]`).

**Skills:** `db-migration` (55), `design-check` (78), `verify-merge` (46), `wrapup` (34).

---

## 16. Gate for Session 2

Per the brief, Session 2 must not propose deletions while the git picture is unresolved.

**There are no open PRs, so the PR gate is clear.** What is *not* clear:

1. **`b/budgeting-performance`** — 2 unpushed commits, ~1300 lines including a new pure lib, 268
   lines of tests, 5 new components, and a `PROJECT-CONTEXT.md` edit. Land / park / abandon?
2. **Three `[gone]` local branches** (`b/budgeting-rework`, `b/csv-import`, `b/pdf-import`) are
   merged leftovers and safe to delete, but that is the owner's call, and deleting `b/csv-import`
   requires switching off it first.
3. **Local `main` is 3 behind** and should be fast-forwarded.
4. **Two untracked docs** (`PHASE-ROADMAP.md`, `docs/dashboard-recon.md`) — commit or not? Ground
   rule "never propose deleting… any file with uncommitted changes" makes their status matter to
   Session 2, and Session 5 is scheduled to rewrite `PHASE-ROADMAP.md`.
5. **Live-DB verification did not run** (§12). If schema truth matters to Sessions 5/6, the
   Supabase MCP must be authenticated at the start of a session.

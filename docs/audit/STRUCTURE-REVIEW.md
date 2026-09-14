# STRUCTURE-REVIEW.md — is the repository layout still fit for purpose?

> Session 4 of the audit operation, 2026-09-14, Claude Opus 5. Read-only.
> Assessed on `b/audit-cleanup` @ `a0e75fa`, i.e. **after** the Session 3 cleanup.
> Stance per `AUDIT-BRIEF-ADDENDUM.md` §1: the default verdict is "no change needed", and a
> reorganisation is not an improvement by default.

---

## Verdict

```
Root & docs hygiene:  CHANGE NEEDED
src/ structure:       NO CHANGE NEEDED
```

---

## `src/` — no change needed

**The layout is a conventional `lib/` / `components/` / `pages/` split and it is holding up well at
96 files. I could not name a problem the owner would actually notice, so there is no proposal and
no decision block for this section.**

That is not a shrug — I looked for specific failures and found none:

- **Layering is clean and one-directional.** `src/lib/` never imports from `components/` or
  `pages/` (verified: zero hits). `components/` never imports from `pages/` (zero hits). The shared
  primitives in `components/ui/` import nothing but `react`, `react-router-dom` and `lucide-react`.
- **No circular imports.** I resolved every relative import across all 31 non-test modules in
  `src/lib/` and checked for mutual pairs. None.
- **Nothing is misfiled.** Every pure function is in `lib/`, every route component is in `pages/`,
  every shared primitive is in `ui/`. The two feature folders that exist (`lib/import/`,
  `components/budgeting/`) are exactly the two subsystems big enough to warrant one.
- **A `hooks/` directory would be empty.** The project has precisely two custom hooks —
  `usePrivacy` and `useTheme` — each a one-line `useContext` wrapper living beside the context it
  wraps (`src/lib/PrivacyContext.jsx:3`, `src/lib/ThemeContext.jsx:3`). Creating a directory for
  two one-liners is ceremony, not structure.
- **`lib/import/` is the model the rest could follow, and it already emerged naturally** — 15
  modules, one impure edge (`extractText.js`), ~200 tests. Nobody needs to impose that; it happened
  because the boundary was real.

### The one thing that *is* a real problem — and why it still isn't a structure change

Three page components are genuinely too large to hold in your head: `Income.jsx` (1225 lines),
`Import.jsx` (1194) and `WalletDetail.jsx` (989). `WalletDetail.jsx` is the worst *shape* of the
three — it branches three distinct wallet behaviours (fixed, variable, and the Unallocated outbound
interface) inside one component. `UNDERSTANDING.md` §8 lists all three as medium-risk for an
autonomous agent for exactly this reason.

The brief's Session 4 text does ask "is any single file large enough that it should be split?", so
this is in scope to raise. I am raising it and **not** proposing it, for three reasons:

1. **It is a refactor, not a relocation.** Splitting `WalletDetail.jsx` means deciding what state
   crosses the new boundaries, in a file that calls `distribute_from_unallocated` and mounts
   thirteen components. That is feature work with its own design and its own approval, which ground
   rule 8 puts outside this operation.
2. **The cost lands on code that has no test to catch a mistake.** Nothing under `src/pages/` or
   `src/components/` is tested — `vitest.config.js` includes `src/**/*.test.js` only, in the `node`
   environment. A page split would be verified by the build and by eye, and this project has a
   documented history of a merge that passed the build and still white-screened at runtime.
3. **It would collide with work you have chosen to keep.** `b/budgeting-performance` touches
   `src/pages/Budgeting.jsx`, `src/components/WalletModal.jsx`, four files in
   `src/components/budgeting/` and two in `src/lib/`. It is already 6 commits behind `origin/main`;
   moving files under it would make that rebase materially harder.

**Recorded for the scope discussion, not proposed here.**

### Cost of a hypothetical `src/` move, stated for completeness

Had I proposed one: 32 of 96 tracked `src/` files import from `lib/` and 9 import from
`components/`, so renaming either directory rewrites imports in **at least 41 files** — a diff
touching roughly half the codebase, with two unmerged branches to rebase across it. The benefit
would have to be very concrete to justify that. It is not.

---

## Root & docs hygiene — change needed

This is judged separately and to a lower bar, per the addendum: moving a plan file breaks no code.

After Session 3, the repository root holds **11 markdown files**. Five are entry points a newcomer
or a fresh session should meet first. Six are feature-specific specifications that only matter once
you are already working on that feature:

| Root markdown | Role |
|---|---|
| `CLAUDE.md` | Entry doc, auto-loaded by Claude Code — **must stay in root** |
| `README.md` | GitHub front page — **must stay in root** |
| `PROJECT-CONTEXT.md` | The master context, first thing every session reads — stays |
| `DESIGN-SPEC.md` | The locked design language, cited by the design-check skill — stays |
| `PHASE-ROADMAP.md` | What happens next — stays |
| `budgeting-page-plan.md` | Feature spec (647 lines) |
| `pdf-import-plan.md` | Feature spec (337 lines) |
| `kbc-adapter-spec.md` | Feature spec (183 lines) |
| `kbc-csv-import-background.md` | Feature spec (142 lines) |
| `encryption-with-key-plan.md` | Feature spec, unbuilt phase (159 lines) |
| `backup-restore-feature-plan.md` | Feature spec, unbuilt phase (85 lines) |

The bottom six are 1,553 lines of specification sitting at the same level as the five documents
that tell you where to start. `docs/` already holds `archive/` and `audit/`, so the convention
exists; these six simply never moved there.

One proposal follows. Nothing else in root or `docs/` needs touching — the config files
(`vite.config.js`, `vitest.config.js`, `eslint.config.js`, `package.json`, `index.html`,
`vercel.json`) must live in root, and `docs/` itself is already coherent.

**Explicitly not proposed:** moving `docs/wallets.png`, `docs/income.png` and `docs/settings.png`
into a `docs/mockups/` folder. They are cited by exact path at `DESIGN-SPEC.md:183`, and breaking a
citation in a protected file to tidy three files is a bad trade.

---

### S-001 · Move the six feature specifications from the repo root into `docs/plans/`
**What it is:** `budgeting-page-plan.md`, `pdf-import-plan.md`, `kbc-adapter-spec.md`,
`kbc-csv-import-background.md`, `encryption-with-key-plan.md`, `backup-restore-feature-plan.md` —
1,553 lines of feature-specific specification currently in the repository root.

**Why it may go:** The root is the repository's front door. Today it presents eleven markdown files
with no visual hierarchy, so the five that orient a newcomer sit level with six that only matter
mid-feature. Moving the six leaves a root where every markdown file is an entry point.
`docs/archive/` and `docs/audit/` already establish that `docs/` is where non-entry documentation
lives.

**Risk if actioned:** Low, but **not zero, and the detail matters.** These are not dead files —
four of the six are cited from *inside working source code* as authoritative specifications:

| Spec | Cited from |
|---|---|
| `budgeting-page-plan.md` | `resolveCappedInflow.js:1`, `budgetPlan.js:1`, `budgetFlowLayout.js:1`, `WalletTile.jsx`, `BudgetFlowChart.jsx`, `DistributionEditor.jsx`, `PageHeader.jsx`, 2 migrations — and `CLAUDE.md` rule 7 calls it "authoritative" |
| `pdf-import-plan.md` | `dedupe.js`, `detectBank.js`, `buildRows.js`, `normalize.js`, `suggestWallet.js`, `types.js`, `Import.jsx`, 2 migrations |
| `kbc-adapter-spec.md` | `banks/kbc.js`, `normalize.js`, `kbc.test.js`, 1 migration |
| `kbc-csv-import-background.md` | `banks/kbcCsv.js`, `matchRecurring.js`, `reconcile.js`, `monthlySnapshots.js`, `Import.jsx`, 1 migration |

**No code imports them** — every citation is a comment referencing the file by bare name and section
(e.g. `// Pure money math for the automated capped-wallet mechanic (budgeting-page-plan.md §4.2)`).
So **the build, the tests and the app cannot break.** A bare filename also stays greppable after a
move, so no comment becomes unfindable. But the citations become imprecise, and
`CLAUDE.md` + `PROJECT-CONTEXT.md` §9 + `PHASE-ROADMAP.md` name several of these by path and would
need updating — which is already Session 5's task and should be folded into it rather than done
twice.

**Alternative:** Leave them. Eleven markdown files in a root is untidy, not broken, and every one
of them is a file you would find by name anyway. If the answer here is `no`, nothing downstream
changes — Session 5 proceeds identically.

**Proposed action:** MOVE → `docs/plans/`

**DECISION:** ?

**Notes:**

---

## Summary

- **1 proposal**, `S-001`, in root/docs hygiene. Low risk, no code impact, reversible.
- **0 proposals for `src/`** — the layout is sound and I am not going to manufacture a
  reorganisation to fill the section.
- **1 finding recorded but deliberately not proposed:** three oversized page components
  (`Income.jsx`, `Import.jsx`, `WalletDetail.jsx`). That is a refactor for the scope discussion,
  gated behind the unmerged branches and — ideally — behind some test coverage for `src/pages/`.

Per the addendum, a review interface (`structure-review.html`) is required only when a verdict is
CHANGE NEEDED. One verdict is, so it accompanies this file — though with a single block, editing
`DECISION:` above directly is likely faster.

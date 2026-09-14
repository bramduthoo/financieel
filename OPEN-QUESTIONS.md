# OPEN-QUESTIONS.md — decisions waiting on the owner

> Every unresolved question in the project, in one place. Created 2026-09-14 by the audit
> operation (`docs/audit/`), seeded from questions previously scattered through
> `PROJECT-CONTEXT.md` §4/§6, `docs/dashboard-recon.md`, and the audit's own findings.
>
> **This file holds questions, not status.** Status lives in `PROJECT-CONTEXT.md` §6.
>
> When a question is answered: record the decision in `PROJECT-CONTEXT.md` §7 (the decision log),
> then delete the row here. A question that has been answered does not belong in this file.

---

## Blocking — something is waiting on these

### Q1 · `b/budgeting-performance`: land it, or abandon it?
**Context:** Two unpushed commits carrying Budgeting Phase C — a new pure lib
(`src/lib/budgetPerformance.js`, 213 lines) with 268 lines of tests, four new components, a new
`budgeting-phase-C.md`, and edits to `DESIGN-SPEC.md` and `PROJECT-CONTEXT.md`. ~1,300 lines total.
The branch is **6 commits behind `origin/main`**, so landing it needs a rebase, not a push.
**Unblocks:** the Budgeting feature's completion. Also removes the only thing that makes a future
`src/pages/` refactor awkward.
**Cost of waiting:** the rebase grows harder as `main` moves. Nothing else degrades.
**Raised by:** audit Session 1 (`docs/audit/INVENTORY.md` §1.4).

### Q2 · Is this still a two-person project?
**Context:** `CLAUDE.md` described a two-person workflow with `b/` and `f/` branch prefixes.
**No `f/` branch has ever existed.** `origin/WOUTER` is 67 commits behind `main` and 0 ahead;
`woholvoe` has 6 of 86 commits, none since 2026-06-24. As of 2026-09-14 `CLAUDE.md` was rewritten
single-maintainer (audit D-16, option b).
**Unblocks:** nothing today — but if a second person returns, the branch convention and the
first-time-setup section both need restoring.
**Raised by:** audit Session 1 (DISC-14).

---

## Schema — each needs a migration via the `db-migration` skill

### Q3 · Should `transactions_import_fingerprint_idx` become UNIQUE?
**Context:** The index added with the PDF import is **non-unique**, so cross-import duplicate
detection is client-side only. A double-submit, or a second tab holding a stale fingerprint set,
could insert the same bank transaction twice. Promoting it to a UNIQUE partial index would make the
invariant DB-enforced.
**Why now is the cheapest moment:** there are **0 imported rows**, so nothing can conflict during
the migration. That will stop being true after the first real import.
**Unblocks:** DB-enforced import dedupe. **The most consequential item in this file.**
**Raised by:** `PROJECT-CONTEXT.md` §6, deliberately not bundled into PR #18.

### Q4 · Should `reset_user_data(p_full)` clear the import tables?
**Context:** The function touches neither the 2026-07-26 import tables nor the 2026-07-30 CSV ones.
A full reset already removes `recurring_import_links` via FK cascade (the rules are deleted), but
`monthly_balance_snapshots` **survives a full reset**, as do `counterparty_wallet_mappings` and
`imported_statements`.
**Unblocks:** whether "Full reset" in the Settings danger zone means what the UI implies. Requires a
`CREATE OR REPLACE FUNCTION` migration.
**Raised by:** `PROJECT-CONTEXT.md` §4.

---

## Testing — gaps, ordered by risk

### Q5 · `src/lib/recurringAmountUpdate.js` has zero tests
**Context:** 111 lines that write to the database, re-version recurring rules (archive + successor
with `parent_rule_id`), and carry an error-recovery path that restores an archived rule if the
insert fails. Its own header calls it "the ONE definition of that write". **The largest coverage
gap in the project weighted by risk** — larger than any page.
**Unblocks:** confidence in the re-pricing path shared by the Income page and the CSV import's
deviation flow.
**Raised by:** audit Session 1 (`docs/audit/INVENTORY.md` §10).

### Q6 · When does `src/pages/` get test coverage?
**Context:** Nothing under `src/pages/` or `src/components/` is tested — ~9,000 lines of JSX.
`vitest.config.js` sets `include: ['src/**/*.test.js']` in the `node` environment, so a `.test.jsx`
would not even be collected and React components cannot render. Adding coverage needs jsdom,
`@testing-library/react`, and a change to that glob.
**Unblocks:** the page-splitting refactor recorded in `docs/audit/STRUCTURE-REVIEW.md`
(`Income.jsx` 1225 lines, `Import.jsx` 1194, `WalletDetail.jsx` 989). That refactor is unsafe
without it.
**Deliberate, not an oversight:** the owner chose logic-first, and the money math in `src/lib/` is
the well-tested part. Postponing this is coherent as long as the refactor is also postponed.
**Raised by:** audit Sessions 1 and 4.

### Q7 · The `now`-injection seam in `dashboardCalcs.js`
**Context:** 268 lines, 10 exports, **6 tests** — because `new Date()` is read internally at lines
32, 76, 125 and 163 with no injectable parameter. Compare `walletMetrics.js`: 67 lines, 3 exports,
12 tests, because it takes `now = new Date()`. Already agreed to be threaded during the dashboard
rebuild rather than bolted on.
**Unblocks:** deterministic dashboard tests.
**Raised by:** `docs/testing-notes.md`, `docs/dashboard-recon.md`.

---

## Small and cheap

### Q8 · Fix the four raw palette classes in `src/App.jsx`?
**Context:** `src/App.jsx` is the only file in `src/` that never got tokenized —
`bg-gray-50 dark:bg-gray-950` and `text-gray-400` on the loading screen (lines 71-72), and
`bg-green-500 text-white` on the signup welcome banner (line 84). These are the first two views a
new user sees, and both ignore the theme.
**Unblocks:** full design-token compliance. Four lines of work.
**Raised by:** audit Session 1 (DISC-05).

### Q9 · `npm run lint` has been red for months
**Context:** 44 problems — 33 errors, 11 warnings. Notably **11 `react-hooks/static-components`**
("Cannot create components during render"), which is a real re-mount bug class, not a style nit.
CI runs `npm test` only, so nothing catches regression.
**Unblocks:** being able to trust lint as a gate. Until then the count is a baseline, not a target.
**Raised by:** audit Session 1 (DISC-03).

### Q10 · `b/privacy-mode`: delete the branch?
**Context:** 3 commits ahead of `origin/main`, 24 behind. All three landed on `main` under
different SHAs (PRs #9 and #10); `PrivacyContext.jsx` exists on `main` and there is no currency
picker, so the net state matches. Nothing unique appears to remain.
**Unblocks:** branch hygiene only.
**Raised by:** audit Session 1 (`docs/audit/INVENTORY.md` §1.5).

### Q11 · The stale `Test salary` €1000 income entry
**Context:** Created 2026-07-10 on the test account while screenshotting `DistributionPopup`. The
income row exists with **no distribution**, so every db-verifier run reports it as a violation. No
balance impact.
**Unblocks:** a clean db-verifier pass.
**Raised by:** `PROJECT-CONTEXT.md` §6, outstanding since July.

---

*Answered a question? Record the decision in `PROJECT-CONTEXT.md` §7, then delete its row here.*

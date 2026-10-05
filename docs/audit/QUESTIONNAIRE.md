# QUESTIONNAIRE.md — where we are, and where we are going

> Produced by **Session 6** of the audit operation (`docs/audit/AUDIT-BRIEF.md`), 2026-09-14,
> Claude Opus 5, per `docs/audit/QUESTIONNAIRE-SPEC.md`. Read-only session — nothing outside
> `docs/audit/` was modified.
>
> **This file is the input device for the owner.** Every `**ANSWER:**` field is empty and stays
> empty until you fill it. A companion interface, `docs/audit/questionnaire.html`, renders the
> same questions with keyboard navigation, priority filters and a JSON export — open it by
> double-clicking. Editing this markdown directly works just as well; the JSON is what a later
> session parses if it is present.
>
> Every question cites the file, line or document it came from. Where I am inferring rather than
> verifying, the sentence says so.

---

## How to read this

**127 questions**, in two parts.

- **Part A — where we are.** Questions that come *from* the code: things that are unclear,
  half-finished, inconsistent, or that I would do differently. Most of these are "confirm or
  correct my reading", which makes them faster to answer than they look.
- **Part B — where we are going.** Questions that come *to* you: remaining scope, feature
  behaviour, visual direction, and what "done" means. These are slower, because several of the
  answers do not exist anywhere yet.

| | Questions | MUST | SHOULD | NICE |
|---|--:|--:|--:|--:|
| **Part A** | 64 | 13 | 30 | 21 |
| **Part B** | 63 | 19 | 36 | 8 |
| **Total** | **127** | **32** | **66** | **29** |

### By section

| § | Section | Questions | MUST | SHOULD | NICE |
|---|---|--:|--:|--:|--:|
| A1 | Unexplained code | 7 | 1 | 3 | 3 |
| A2 | Half-built and abandoned | 10 | 5 | 3 | 2 |
| A3 | Internal inconsistency | 8 | 2 | 5 | 1 |
| A4 | Known issues — confirm and prioritise | 11 | 1 | 7 | 3 |
| A5 | Rule violations | 5 | 1 | 1 | 3 |
| A6 | Test coverage | 7 | 2 | 3 | 2 |
| A7 | My suggestions | 8 | 0 | 4 | 4 |
| A8 | Data and schema | 8 | 1 | 4 | 3 |
| B1 | Definition of done | 5 | 3 | 2 | 0 |
| B2 | Remaining scope | 11 | 5 | 6 | 0 |
| B3 | Feature behaviour | 11 | 3 | 8 | 0 |
| B4 | Visual direction and layout | 9 | 1 | 5 | 3 |
| B5 | Platform and reach | 6 | 1 | 4 | 1 |
| B6 | Data, privacy and trust | 7 | 2 | 3 | 2 |
| B7 | Collaboration | 3 | 1 | 1 | 1 |
| B8 | Working style and autonomy | 7 | 2 | 4 | 1 |
| B9 | Constraints | 4 | 1 | 3 | 0 |

**Priority means:** `MUST` — a roadmap cannot be built without this answer. `SHOULD` —
materially changes the plan. `NICE` — would improve the result but blocks nothing.

---

## Start here — the ten that unblock the most

If you answer nothing else, answer these. Each one changes the answer to several others.

1. **Q-065** · B1 · What this is — Personal tool or product. Scales every other answer in the file — polish, onboarding, encryption, scale, signup, deletion.
2. **Q-072** · B2 · Client-side encryption — Encryption scope. Decides whether the money layer moves into the database or out of it, and therefore settles Q-018, Q-038, Q-045 and Q-046 at once.
3. **Q-101** · B5 · Mobile — Mobile. If yes, the shell change comes before the dashboard rebuild, not after — otherwise the dashboard gets designed twice.
4. **Q-086** · B3 · Dashboard purpose — What the first screen should say. Drives the entire dashboard rebuild, and therefore Q-070's scope.
5. **Q-066** · B1 · Stopping point — What 'done' looks like. Turns the remaining scope into a finite list.
6. **Q-077** · B2 · Cuts — What gets cut. The only operation that makes the list shorter.
7. **Q-018** · A3 · Money paths — atomicity — Money-path atomicity. The largest correctness gap, and the item most likely to be made worse by an unsupervised tidy-up.
8. **Q-015** · A2 · Budgeting Phase C — Budgeting Phase C. Unblocks the only unmerged branch, and the rebase gets harder every week.
9. **Q-010** · A2 · Imports — First real CSV import. Validates 200 tests against reality and is a hard input to Q-011.
10. **Q-117** · B8 · Review boundary — Review boundary. Determines how every other answer in this file actually gets executed.

> ⚠️ Not on the start-here list because it does not unblock anything — but **Q-083 is the single finding I would act on before anything else**. `src/pages/Wallets.jsx:53-58` hard-deletes a wallet with no balance check, so a wallet holding money can be deleted in two clicks and that money disappears from the sum of balances with nothing recording where it went. Every other money path in this app is careful. This one is not guarded at all.

---

## How long this takes

Roughly **3 to 5 hours** to answer honestly, best split across six or seven sittings of about twenty questions each. The **MUST-only pass is 32 questions and roughly 75 to 100 minutes** — that alone is enough to build a roadmap from. Part A (the code) is faster than it looks because most answers are 'confirm or correct my reading'; Part B is slower because several answers are genuinely yours to invent.

**Partial answers are fine and expected.** This file can be returned incomplete. An unanswered question is simply an unanswered question — nothing downstream treats silence as consent. If you answer nothing else, answer the ten in the start-here list, or the five at the very bottom.

---


# Part A — where we are

Everything below traces to something I read in this repository or queried in the live
database. If a reading is wrong, saying so is a complete answer.


## A1. Unexplained code

*7 questions — 1 MUST, 3 SHOULD, 3 NICE.*

### Q-001 · Part A · Distribution engine · Priority: MUST

**Context:** `src/lib/distributeIncome.js:17` — `isAutomated` is the only switch that enables the capped-wallet mechanic, and `isAutomated: true` appears at exactly one call site in the whole codebase, `src/pages/IncomeRecurringDetail.jsx:174`. Manual income (`src/pages/Income.jsx:1126`) and imported income (`src/pages/Import.jsx:823`) both pass `false`. So the entire capped subsystem is reachable only by pressing 'Log income' on a recurring income's detail page.

**Question:** Is 'caps apply only to recurring income logged from the recurring detail page' the intended product rule, or an artefact of where the flag happened to get wired?

**Why it matters:** `CLAUDE.md` rule 7 describes the capped mechanic in detail without saying it has a single entry point. A reader meeting the word 'capped' would reasonably assume it applies wherever money lands in a capped wallet. If it should apply more widely, the change is one flag; if not, the docs should say so explicitly so nobody 'fixes' it later.

**Options I see:**
  (a) Intended and final — caps are a recurring-income concept only.
  (b) Caps should also apply to imported credits routed into a capped wallet.
  (c) Caps should apply on every income path, including manual entry.

**My recommendation:** (a), plus one sentence in `CLAUDE.md` rule 7 naming the single entry point. The asymmetry is deliberate per the decision log, but its narrowness is currently invisible from the documentation.

**ANSWER:**

---

### Q-002 · Part A · Unallocated plans · Priority: SHOULD

**Context:** `src/lib/unallocatedPlans.js:44` — `firePlan` refuses to distribute at all if a plan's items do not fully allocate the computed amount. It logs and returns, moving nothing.

**Question:** When a plan under-allocates, should it stay silent, or surface to the user?

**Why it matters:** A misconfigured plan (items summing to less than the trigger amount) silently never fires, and the user has no signal at all. This determines whether plan configuration needs validation, a UI surface, or both.

**Options I see:**
  (a) Keep it silent — treat it as a configuration error the user will notice from the balance.
  (b) Surface it in the conflict banner as a 'plan could not fire' state.
  (c) Validate at plan-save time so an under-allocating plan cannot be saved in the first place.

**My recommendation:** (c) then (b). Prevention at save time is cheap and catches the common case; a silent refusal on real money is the kind of thing that gets discovered months later.

**ANSWER:**

---

### Q-003 · Part A · Unallocated plans · Priority: SHOULD

**Context:** `src/lib/unallocatedPlans.js:49` carries the comment `// HOOK: Stage 4e will log plan firings here.` No plan-firing log exists. An automatic distribution leaves transaction rows, but nothing records that a *plan* caused it rather than the user.

**Question:** Was the firing log dropped deliberately, or forgotten?

**Why it matters:** It determines whether the Unallocated plan system needs an audit surface of its own, and whether the history tab the docs describe already covers it. It also affects Q-088: if a stall is invisible and a firing is invisible, the whole automatic layer is opaque.

**Options I see:**
  (a) Forgotten — build it.
  (b) Deliberate — the transaction rows are enough; delete the comment.
  (c) Build it only if plans turn out to move real money regularly.

**My recommendation:** (b) if you can already tell a plan-driven credit from a manual one by its note text; otherwise (a). I could not find a marker in the written rows that distinguishes them.

**ANSWER:**

---

### Q-004 · Part A · Imports · Priority: NICE

**Context:** `src/lib/import/detectBank.js:8` — `ADAPTERS = [kbc]` registers only the PDF adapter. `banks/kbcCsv.js` is called directly from `buildCsvRows.js` and is never registered. The code comments explain why (the source is an explicit user toggle, and putting a CSV into a PDF registry risks misparsing), but the project docs describe 'two import sources' as if they share a routing layer.

**Question:** Should a second bank ever be supported, and if so does the CSV path get a registry too?

**Why it matters:** It decides whether `detectBank` stays a one-adapter special case or becomes real infrastructure — which changes the cost of adding a second bank from 'write an adapter' to 'write an adapter and generalise the routing'.

**Options I see:**
  (a) KBC only, forever — keep the asymmetry, it is honest.
  (b) Plan for a second bank, but generalise the registry when the second adapter actually arrives.
  (c) Generalise the registry now.

**My recommendation:** (b). Never generalise a registry from one example — the shape of the second adapter is what tells you what the abstraction should be.

**ANSWER:**

---

### Q-005 · Part A · Money rounding · Priority: NICE

**Context:** `src/lib/format.js` is deliberately display-only — its header and the decision log both say calculation and rounding stay out of it. The consequence is that the one-line helper `const round2 = n => Number(Number(n).toFixed(2))` is copy-pasted into nine places: `DistributionPopup.jsx:8`, `budgeting/DistributionEditor.jsx:17`, `budgetFlowLayout.js:9`, `budgetPlan.js:15`, `resolveDistribution.js:9`, `unallocatedPlans.js:4`, `Budgeting.jsx:16`, `WalletDetail.jsx:23`, and again as a `function` in `Income.jsx:35`.

**Question:** Is the nine-way duplication deliberate, or just never cleaned up?

**Why it matters:** Money rounding is the single thing you would most want defined once. If the duplication is a deliberate consequence of keeping `format.js` pure-display, that reasoning should be in the decision log; if not, one shared pure module is a twenty-minute change fully covered by existing tests.

**Options I see:**
  (a) Deliberate — keeping `format.js` display-only is worth nine copies.
  (b) Extract it to a new pure module (e.g. `src/lib/round.js`) and import it everywhere.
  (c) Put it in `format.js` anyway, with an export name that makes the distinction clear.

**My recommendation:** (b). It preserves the display/calculation separation the decision log cares about while removing the duplication, and it is the kind of change that is safe precisely because the callers are all tested.

**ANSWER:**

---

### Q-006 · Part A · Capped wallets · Priority: SHOULD

**Context:** `PROJECT-CONTEXT.md` §8 records that a capped wallet with a NULL `cap_max` treats its whole inflow as above the ceiling, because `Number(null)` is 0 — so a wallet with a custom `cap_reduction_rate` and no ceiling would silently reduce every credit. The UI now makes `cap_max` required (`WalletModal.jsx:74`) and a CHECK constraint backs it, but rows created before Phase A may still carry NULL.

**Question:** Should `resolveCappedInflow` defend against a missing `cap_max` rather than relying on the UI, and should any existing NULLs be backfilled?

**Why it matters:** One line in a pure, tested, 28-line function versus a silent money bug on legacy rows. The note says all current capped rows are dummy data, but that has not been re-verified since July.

**Options I see:**
  (a) Add a guard in `resolveCappedInflow.js` treating a missing `cap_max` as 'no ceiling'.
  (b) Backfill `cap_max` on any NULL rows via migration and leave the code alone.
  (c) Neither — all such rows are dummy data and the risk is already gone.

**My recommendation:** (a) and (b). The guard costs nothing and the live DB should be queried once for NULL `cap_max` on `budget_type = 'capped'` rows before this is closed either way.

**ANSWER:**

---

### Q-007 · Part A · Settings · Priority: NICE

**Context:** `settings.strict_distribution` gates the Confirm button in `DistributionPopup` and is read at `Income.jsx:168`, `Import.jsx:163` and `WalletDetail.jsx:94`, each defaulting to `true` when the row is missing. The Budgeting page never reads it — there is no `strict_distribution` reference in `src/pages/Budgeting.jsx`.

**Question:** Should strict mode also constrain the Budgeting page's plan editing, or is it deliberately a per-income-log concept only?

**Why it matters:** Budgeting writes the same `income_distribution_rules` rows the recurring log later consumes. If strict mode means 'a distribution must exactly exhaust the amount', the plan editor is the one place it is not enforced.

**Options I see:**
  (a) Deliberate — Budgeting has its own coverage model and does not need it.
  (b) Apply it to Budgeting too.
  (c) Drop strict mode as a setting entirely and always require exhaustion.

**My recommendation:** (a). Budgeting's covered / short / over summary already tells the user the same thing in a better vocabulary, and it is plan-level across incomes rather than per-income, which strict mode cannot express.

**ANSWER:**

---


## A2. Half-built and abandoned

*10 questions — 5 MUST, 3 SHOULD, 2 NICE.*

### Q-008 · Part A · Investment wallets · Priority: MUST

**Context:** `src/pages/WalletDetail.jsx:461-464` renders, for `wallet.type === 'investment'`, a card whose entire content is the sentence 'Investment wallet features coming in Phase 7.' The type is otherwise fully wired: creatable in `WalletModal.jsx:123`, a distribution target group in `DistributionPopup.jsx:16`, a free-pool wallet in `budgetPlan.js:24`, listed on `Wallets.jsx:67`, with its own icon in `walletIcons.js:29`.

**Question:** Finish investment wallets, remove the type, or make the placeholder honest?

**Why it matters:** Money can already be distributed into an investment wallet, and its detail page then shows nothing about it — not even a balance or a transaction list. It is the only place in the app where a funded wallet has no view. It also decides whether 'Investment wallet type' stays on the parked list.

**Options I see:**
  (a) Finish it — decide what the page shows (value over time, contributions vs current value, manual valuation).
  (b) Remove the type until it is actually wanted, migrating any existing wallets to variable.
  (c) Keep it simple but honest — show the balance and transaction history like any other wallet, and drop the 'Phase 7' copy.

**My recommendation:** (c) now, (a) later if you want it. A one-card fix removes a dead-end screen without committing to a phase. If (b), skip Q-074.

**ANSWER:**

---

### Q-009 · Part A · Imports · Priority: SHOULD

**Context:** `imported_statements` exists in the live DB with 0 rows and is written by nothing — `PROJECT-CONTEXT.md` §4 says so explicitly and warns not to 'fix' it by writing placeholder rows. It was created 2026-07-26 as scaffolding for a future classic-uittreksel (paper statement) adapter.

**Question:** Is a third import source still wanted?

**Why it matters:** It decides whether the table stays as scaffolding, gets documented as speculative, or gets dropped — and whether the CSV adapter is the end of import work.

**Options I see:**
  (a) Yes, still wanted — keep the table.
  (b) No — drop the table in a migration and record the decision.
  (c) Undecided — keep it, but mark it in §4 as speculative scaffolding, not a planned feature.

**My recommendation:** (c) until the first real CSV import has run (Q-010). The monthly CSV export may well make a third source unnecessary, and you will know within one import.

**ANSWER:**

---

### Q-010 · Part A · Imports · Priority: MUST

**Context:** `PROJECT-CONTEXT.md` §6.2 — the first real CSV import has never run. The schema is applied and verified, and the audit's live-DB pass on 2026-09-14 confirmed `recurring_import_links` and `monthly_balance_snapshots` both hold 0 rows. Roughly 200 of the project's 352 tests protect this pipeline.

**Question:** When will the first real import run, and should anything be built before it does?

**Why it matters:** It is the single highest-information event available to the project: 15 modules and 200 tests are currently validated only against fixtures. It is also a hard input to Q-011, whose decision gets materially harder once rows exist.

**Options I see:**
  (a) Run it next, before any new feature work.
  (b) Run it alongside the dashboard rebuild.
  (c) Not a priority — the feature can wait for real need.

**My recommendation:** (a). It is the cheapest way to find out whether the import subsystem is actually finished, and it is a prerequisite for answering Q-011 honestly.

**ANSWER:**

---

### Q-011 · Part A · Imports / schema · Priority: MUST

**Context:** `OPEN-QUESTIONS.md` Q3 — `transactions_import_fingerprint_idx` is non-unique, so cross-import duplicate detection is client-side only (`src/lib/import/dedupe.js`). A double-submit, or a second tab holding a stale fingerprint set, could insert the same bank transaction twice. With 0 imported rows today, a UNIQUE partial index could be added with nothing to conflict. The register flags this as 'the most consequential item in this file'.

**Question:** Promote the index to UNIQUE now, or accept client-side dedupe permanently?

**Why it matters:** It is the cheapest this decision will ever be — after the first real import, adding a UNIQUE index means resolving existing duplicates first. But the fingerprint's shape may make uniqueness wrong rather than merely expensive.

**Options I see:**
  (a) Promote it to UNIQUE now, via the `db-migration` skill.
  (b) Leave it non-unique — the client check is enough, and a UNIQUE index would reject a legitimate second identical transaction.
  (c) Promote it, but widen the key so two genuinely identical same-day transactions can still both land.

**My recommendation:** **This is the one place where I disagree with the recommendation already recorded in `OPEN-QUESTIONS.md`.** `fingerprintOf` (`src/lib/import/dedupe.js:16`) is `iban|date|amount|direction|counterpartyKey` — which is byte-identical for two €10,40 train tickets bought on the same day. The decision log explicitly argues those are real and must not default to skipped. A UNIQUE index would make them impossible to record at all. So (b), or (c) if you want DB enforcement — but (a) as written contradicts a decision already taken.

**ANSWER:**

---

### Q-012 · Part A · Dashboard · Priority: SHOULD

**Context:** `docs/dashboard-recon.md` §1 records that 'Needs attention' is rendered twice on the dashboard — a compact grouped card gated on `hasAlerts`, and a verbose always-on block — both reading the same `overdue` / `overspent` / `underfunded` arrays. The recon calls it 'pure redundancy; collapse to one'.

**Question:** Delete the duplicate now, or leave it for the dashboard rebuild?

**Why it matters:** It is a roughly twenty-line deletion. Waiting means shipping a known redundancy for however long the rebuild takes, and the rebuild has been pending since July.

**Options I see:**
  (a) Delete the verbose block now, as a standalone fix.
  (b) Leave it — the rebuild will remove it anyway.
  (c) Delete the compact card instead and keep the verbose one.

**My recommendation:** (b) if the rebuild is genuinely next (Q-070); (a) if it is more than a month away. Do not let it sit as 'the rebuild will handle it' indefinitely.

**ANSWER:**

---

### Q-013 · Part A · Dashboard · Priority: SHOULD

**Context:** `docs/dashboard-recon.md` §1 — the six-month outlook shows only `projectedNet` derived from the recurring schedule, ignores actual balances and spend entirely, computes `outlookMax` and never uses it, and its legend implies income/cost bars that are not drawn.

**Question:** Keep, fix, or cut the six-month outlook?

**Why it matters:** It is the clearest example in the app of a widget that looks informative and is not. It also sets the precedent for how much forward projection the rebuilt dashboard should attempt.

**Options I see:**
  (a) Cut it.
  (b) Keep the idea but base it on balances plus actuals, not the recurring schedule alone.
  (c) Keep as-is, and fix only the misleading legend.

**My recommendation:** (a) as part of the rebuild. A schedule-only projection duplicates what the 30-day chart already does better, and the 30-day chart at least starts from real balances.

**ANSWER:**

---

### Q-014 · Part A · Unbuilt phases · Priority: MUST

**Context:** `docs/plans/backup-restore-feature-plan.md` and `docs/plans/encryption-with-key-plan.md` were both written 2026-07-07 and have not been touched since. They are roadmap Phases B and C, and encryption is gated on backup. The backup plan's export list still names `budget_allocations`, a table the live DB confirms has 0 rows and no code reading it.

**Question:** Are backup/restore and client-side encryption still the intended direction, at the same priority?

**Why it matters:** They are the two largest unbuilt items on the books. If either is out, the roadmap shortens dramatically and several other answers in this file change with it.

**Options I see:**
  (a) Both still wanted, in that order.
  (b) Backup yes; encryption parked indefinitely.
  (c) Neither — the app is personal, admin-visible data is acceptable.
  (d) Encryption yes but scoped down (names and notes only, amounts and balances left plaintext).

**My recommendation:** (b) or (d). Backup has standalone value regardless of encryption. Encryption's documented cost — losing DB-side atomicity on the balance RPCs, which are this project's single hardest safety rule — is a heavy price for an app where you are both the user and the admin. Q-072 and Q-107 ask the same thing from the other end; answer whichever is easier.

**ANSWER:**

---

### Q-015 · Part A · Budgeting Phase C · Priority: MUST

**Context:** `OPEN-QUESTIONS.md` Q1 — Budgeting Phase C is roughly 1,300 lines on the never-pushed local branch `b/budgeting-performance`: `src/lib/budgetPerformance.js` (213 lines) with 268 lines of tests, four new components, a `budgeting-phase-C.md`, and edits to `DESIGN-SPEC.md` and `PROJECT-CONTEXT.md`. It is 6 commits behind `origin/main`, so landing it needs a rebase, not a push.

**Question:** Land it, or abandon it?

**Why it matters:** It is the only unmerged work in the project and it blocks two other things: its `PROJECT-CONTEXT.md` edit will conflict with the §6 the audit just rewrote, and the page-split refactor is gated on it. It has been sitting since before 2026-07-30.

**Options I see:**
  (a) Rebase and land it as a PR.
  (b) Abandon the branch and delete it.
  (c) Cherry-pick only the pure lib plus its tests and drop the UI.

**My recommendation:** (a) if the feature is still wanted — the code is written and tested, and it only rots from here. Expect to resolve `PROJECT-CONTEXT.md` by hand: take the audit's new §6 and re-add Phase C as a row in §6.1, rather than accepting the branch's version of the file.

**ANSWER:**

---

### Q-016 · Part A · Routing · Priority: NICE

**Context:** `src/App.jsx:96-109` nests a second `<Routes>` inside the authenticated shell with no catch-all. An unknown path renders the sidebar and an entirely empty content area — no 404, no redirect, no message.

**Question:** Should there be a NotFound route?

**Why it matters:** A typo'd or stale bookmark currently produces a blank page with no explanation, which reads as 'the app is broken' rather than 'that page does not exist'. It is roughly five lines.

**Options I see:**
  (a) Add a `<Route path="*">` that redirects to `/`.
  (b) Add a real 404 page.
  (c) Leave it — it is a private app.

**My recommendation:** (a). Cheapest, and the right shape for a single-user tool where every real route is in the sidebar.

**ANSWER:**

---

### Q-017 · Part A · Course · Priority: NICE

**Context:** `Cursus/` is a 12-chapter course about this codebase (about 620 KB including a 402 KB PDF), last touched 2026-06-12. Its schema chapter is documented as outdated and four chapters cite a deleted `ARCHITECTURE.md`. `PROJECT-CONTEXT.md` §9 already describes it as 'a frozen teaching artefact'.

**Question:** Is the course still a live deliverable?

**Why it matters:** It is a standing maintenance debt that every documentation pass has to route around. Deciding once that it is frozen stops it being re-raised.

**Options I see:**
  (a) Abandoned — mark it frozen once, never update it.
  (b) Still live — schedule a schema-chapter refresh.
  (c) Move it out of this repo entirely.

**My recommendation:** (a). It is already effectively frozen and §9 says so; making it an explicit decision in §7 costs one line and closes the topic.

**ANSWER:**

---


## A3. Internal inconsistency

*8 questions — 2 MUST, 5 SHOULD, 1 NICE.*

### Q-018 · Part A · Money paths — atomicity · Priority: MUST

**Context:** Six of the ten code paths that move money are non-atomic client-orchestrated sequences (`docs/audit/UNDERSTANDING.md` §2.6). `src/lib/distributeIncome.js` fires one `increment_wallet_balance` RPC per row in a loop (`:19`, `:37`, `:45`, `:53`), inspects no result, and inserts the transaction rows only at the end (`:62`). If call 3 of 5 fails, wallets 1 and 2 are already credited and **no transaction row exists at all** — the balances have moved with nothing recording it. Every money path added since 2026-07-09 (`import_transactions`, `edit_income_distribution`, `distribute_from_unallocated`, `reset_user_data`) is a transactional RPC; the back-catalogue was never revisited.

**Question:** Should the older paths be brought up to the transactional standard, and if so in what order?

**Why it matters:** This is the largest correctness gap in the project and the one an autonomous agent is most likely to make worse by tidying. It also needs new RPCs, which means the `db-migration` path and owner approval — so it must be planned, not slipped in.

**Options I see:**
  (a) Yes — write a `distribute_income` RPC mirroring `edit_income_distribution` and move the loop into the database.
  (b) Yes but smaller — add error checking and a compensating write to the existing client loop.
  (c) No — a single user on one device does not realistically hit these failure modes.

**My recommendation:** (a), for `distributeIncome` first. It is the only path where a partial failure leaves balances changed with *no* record of the change — every other non-atomic path at least writes its transaction row alongside. Note this pulls in the opposite direction from client-side encryption (Q-072); decide that first if you can.

**ANSWER:**

---

### Q-019 · Part A · Money paths — reverse/reapply · Priority: SHOULD

**Context:** Five components perform a reverse-then-reapply with two sequential, unchecked RPC calls: `VariableTransactionForm.jsx:47-48`, `VariableTransactionList.jsx:35,39`, `VariableHistory.jsx:89-90`, `PaymentHistory.jsx:108-109`, `VariableOverview.jsx:66`. Neither call's result is inspected; if the second fails, the wallet keeps the credit from the first.

**Question:** Extract these into one shared helper, move them into an RPC, or leave them?

**Why it matters:** They look like obvious duplication, which makes them a magnet for refactoring — and extracting them without adding error handling would propagate the bug into one place rather than fix it. That is precisely the kind of change an unsupervised agent would make.

**Options I see:**
  (a) One atomic `adjust_transaction_amount` RPC replacing all five.
  (b) One shared client helper with proper error handling and rollback.
  (c) Leave them, document the risk.

**My recommendation:** (a). Same argument as Q-018, and it deletes roughly forty lines of duplicated client code. If (a), `CLAUDE.md` rule 1 is worth extending to say 'and transaction-amount edits reverse through an RPC, never through a client pair' (see Q-041).

**ANSWER:**

---

### Q-020 · Part A · Recurring rules · Priority: SHOULD

**Context:** `income_recurring` (income) and `recurring_rules` (expenses) are separate tables with near-identical semantics: both carry `start_date` / `end_date` / `parent_rule_id` version chains, both re-price by archive-and-successor, both feed `recurringUtils.generatePaymentDates`. They are edited by different code in different places (`Income.jsx` versus `RecurringRules.jsx`), and only the re-pricing write was ever extracted, into `src/lib/recurringAmountUpdate.js` — whose own header explains the duplication it did *not* resolve.

**Question:** Is the two-table split permanent, or worth unifying?

**Why it matters:** It doubles the surface for every future change to recurrence — a new frequency, a pause feature, an end-date UI, a scheduler. Every such change has to be made twice, in two files, by two different code paths.

**Options I see:**
  (a) Permanent — income and expense recurrence genuinely differ (distribution rules hang off one and not the other).
  (b) Unify into one table with a direction column.
  (c) Keep the tables, but extract a shared recurrence module covering generation, versioning and editing.

**My recommendation:** (a) with (c). Unifying the tables is a large migration for modest gain; unifying the *logic* is where the duplication actually costs you, and `recurringAmountUpdate.js` already proves the pattern works.

**ANSWER:**

---

### Q-021 · Part A · Recurring rules · Priority: SHOULD

**Context:** `recurring_rules.frequency` carries a CHECK limiting it to monthly / quarterly / yearly. `income_recurring.frequency` has no CHECK at all. `src/lib/recurringUtils.js` implements six frequencies including daily, weekly and custom, and has 10 tests covering all of them (`docs/dashboard-recon.md` §2d).

**Question:** Which is right — should the expense table accept weekly and daily, or should the income table gain a matching CHECK?

**Why it matters:** Today the app can generate dates for frequencies one of its tables refuses to store. The import matcher's own reasoning in the decision log assumes weekly rules exist ('a weekly rule recognises several rows a month'), but a weekly expense cannot be created.

**Options I see:**
  (a) Widen the `recurring_rules` CHECK to match `recurringUtils`.
  (b) Narrow `income_recurring` with a matching CHECK and drop the unused frequencies from `recurringUtils`.
  (c) Leave it — nobody has needed a weekly rule.

**My recommendation:** (a). The import matcher's comments already assume weekly rules are possible, and the date-generation code supporting them is written and tested.

**ANSWER:**

---

### Q-022 · Part A · Distribution storage · Priority: SHOULD

**Context:** `income_distribution_rules` stores `mode` plus `value` (the 'Option A' design in the decision log: euros resolved at apply time, so percentage rules scale to any amount) *and* a legacy `amount` euro column described as 'kept in sync during transition'. The transition never completed: `IncomeRecurringDetail.jsx:169` distributes from `dr.amount`, not by re-resolving `mode`/`value` against the amount actually being logged.

**Question:** Finish the transition, or formalise `amount` as authoritative?

**Why it matters:** It is the direct cause of Q-023's bug, and it is the one place where the project's own stated storage model is not what the code reads. Either answer is fine; leaving both half-true is not.

**Options I see:**
  (a) Finish it — resolve `mode`/`value` at log time; keep `amount` written for display only.
  (b) Keep `amount` authoritative and drop `mode`/`value` from the log path, documenting that percentage rules freeze at their last-saved euro value.
  (c) Leave as-is.

**My recommendation:** (a). It is the smaller change and it makes a percentage rule behave the way the user was told it behaves — which is the entire point of storing mode and value rather than euros.

**ANSWER:**

---

### Q-023 · Part A · Distribution desync · Priority: MUST

**Context:** `src/pages/IncomeRecurringDetail.jsx:404` renders an **editable** amount field, pre-filled from the rule. The `income_entries` row is inserted with whatever the user types (`:160`), but the distribution at `:169` maps `distributionRules` by `dr.amount` — the stored euro column — not by re-resolving against the amount just logged. Change the amount in that modal and the wallet credits no longer sum to the income entry. This is the same defect class as the one flagged in a comment at `Income.jsx:245-251`, reached from a different direction, and it is **not flagged anywhere**.

**Question:** Is this a real bug to fix, and should the amount field in the recurring log modal be editable at all?

**Why it matters:** It silently desyncs an income from its distribution on the path the documentation calls 'automated'. It is also the only reachable entry point to the capped-wallet mechanic (Q-001), so the amounts it produces feed cap arithmetic and overflow routing.

**Options I see:**
  (a) Re-resolve `mode`/`value` against the typed amount (requires Q-022 option (a)).
  (b) Make the field read-only — require re-pricing the rule to log a different amount.
  (c) Keep it editable, but re-run the distribution popup whenever the typed amount differs from the rule's.
  (d) Not a bug — the user is expected to fix the distribution afterwards.

**My recommendation:** (c). It mirrors what the decision log already mandates for recurring income ('editing a recurring income's amount must force re-doing the distribution'), and unlike (a) it does not require the storage change first.

**ANSWER:**

---

### Q-024 · Part A · Budgeting writes · Priority: SHOULD

**Context:** `src/pages/Budgeting.jsx:85-98` rewrites an income's distribution by delete-all-then-reinsert. The comment says it throws on either error 'so callers can surface it and never leave an income half-written', but the two statements are not in a transaction: a failed insert after a successful delete leaves an income with **no** distribution — and a recurring income with no distribution cannot be logged at all.

**Question:** Wrap this in an RPC, or accept it?

**Why it matters:** Same class as Q-018 and Q-019, but with a different failure mode: no money moves, the income simply becomes unusable until someone notices.

**Options I see:**
  (a) One `replace_income_distribution(p_income_id, p_rows jsonb)` RPC.
  (b) Insert-then-delete ordering using a temporary priority offset.
  (c) Accept it — the user can just save again.

**My recommendation:** (a), bundled with whatever RPC work Q-018 produces. `IncomeRecurringDetail` does the same delete-then-reinsert, so one function serves both call sites.

**ANSWER:**

---

### Q-025 · Part A · Import commit paths · Priority: NICE

**Context:** One imported file can produce writes through both an atomic path (`Import.jsx:398` → `import_transactions`) and a non-atomic one (`Import.jsx:823` → `distributeIncome`). This is deliberate and documented in the file's own header at `Import.jsx:11-17` ('commit paths, deliberately kept separate').

**Question:** Is that acceptable, or should imported income also commit transactionally?

**Why it matters:** It means 'the import committed' is not a single guarantee. If Q-018 produces a `distribute_income` RPC, this closes for free without its own effort.

**Options I see:**
  (a) Fine as documented — they are different kinds of write.
  (b) Close it when Q-018 is done, not before.
  (c) Route imported income through `import_transactions` as well.

**My recommendation:** (b). Not worth its own project, worth inheriting. (c) would mean reimplementing the whole distribution step inside the import RPC, which the header explicitly rejected.

**ANSWER:**

---


## A4. Known issues — confirm and prioritise

*11 questions — 1 MUST, 7 SHOULD, 3 NICE.*

### Q-026 · Part A · Income amount-edit desync · Priority: MUST

**Context:** The only `KNOWN` marker in the entire codebase, at `src/pages/Income.jsx:245-251`: 'Editing the amount here updates only the income_entries row — it does NOT re-run distribution, so the wallet credits no longer sum to the new amount, leaving the income and its distribution desynced.' `PROJECT-CONTEXT.md` §6.3 carries it as 'STILL OPEN'. It has been open since the distribution redesign in July.

**Question:** Is this still real, does it still matter, and what priority?

**Why it matters:** It produces silently wrong data rather than an error — the income says one number, the wallets say another, and nothing flags it. It is also the defect the audit found a second, unflagged instance of (Q-023).

**Options I see:**
  (a) Fix now — route amount changes through the distribution editor and its atomic `edit_income_distribution` RPC.
  (b) Fix as part of the next Income-page work.
  (c) Prevent instead — make the amount read-only once an income has credits.
  (d) Not worth fixing.

**My recommendation:** (c) as an immediate stopgap and (a) properly. (c) is a one-line guard that stops the data going wrong today; (a) is the real fix and shares work with Q-023.

**ANSWER:**

---

### Q-027 · Part A · Unhandled rejections · Priority: SHOULD

**Context:** `PROJECT-CONTEXT.md` §8 — '`DistributionPopup` calls `onConfirm` without `await` or `catch`. Any promise that rejects inside a caller's `onConfirm` becomes an unhandled rejection, and because the mandatory popups pass `onClose={null}` the user is left with no message and no way out.' The stated mitigation is that every caller must catch its own errors.

**Question:** Still real? Fix it centrally in the popup, or keep the 'every caller catches its own' contract?

**Why it matters:** There are four call sites and every future one inherits the trap. A user stuck in an un-closable modal on a money action is the single worst failure mode in the app — worse than a failed write, because the user cannot tell what happened or get out.

**Options I see:**
  (a) Fix centrally — `await onConfirm(...)` inside the popup, with a catch that surfaces the error and keeps the modal open but closable.
  (b) Keep the caller contract, and add it to the `code-reviewer` checklist.
  (c) Both.

**My recommendation:** (a). A contract that four independent callers must remember is a contract that will eventually be broken, and the popup is the one place the fix applies to all of them.

**ANSWER:**

---

### Q-028 · Part A · Non-idempotent re-pricing · Priority: SHOULD

**Context:** `PROJECT-CONTEXT.md` §8 — re-pricing a recurring rule is not idempotent: it archives the current version and inserts a successor, so running it twice for one rule leaves two active successors sharing a `parent_rule_id`, i.e. two live recurring rules. The stated mitigation is that any caller producing several updates for one rule must collapse them first. The function this lives in, `src/lib/recurringAmountUpdate.js`, has **zero tests**.

**Question:** Should the non-idempotence be fixed at the source rather than in every caller?

**Why it matters:** The multi-month CSV import is exactly the caller that can produce several updates for one rule — and the function that must never run twice is the one with no test coverage at all.

**Options I see:**
  (a) Guard inside the function — refuse if the rule is already archived.
  (b) Keep the caller contract and add the tests (`OPEN-QUESTIONS.md` Q5 / Q-042 below).
  (c) Both.

**My recommendation:** (c). The tests are needed regardless, and the guard is what makes the double-run case cheap to test.

**ANSWER:**

---

### Q-029 · Part A · Test-account data · Priority: NICE

**Context:** `OPEN-QUESTIONS.md` Q11 — a stale 'Test salary' €1000 income entry created 2026-07-10 while screenshotting `DistributionPopup`. The income row exists with no distribution, so every `db-verifier` run reports it as a violation. No balance impact. Outstanding since July.

**Question:** Delete it, give it a distribution, or teach `db-verifier` to ignore it?

**Why it matters:** It is the only noise in an otherwise clean invariant check, and noise in a checker trains you to skim its output — which is how the next real violation gets missed.

**Options I see:**
  (a) Delete the row.
  (b) Give it a distribution so it passes.
  (c) Add an exclusion to the `db-verifier` agent.

**My recommendation:** (a). It is one row on a test account. (c) is the worst option — it makes the checker permanently less trustworthy to save one delete.

**ANSWER:**

---

### Q-030 · Part A · Test-account data · Priority: SHOULD

**Context:** `docs/dashboard-recon.md` §4 — the test account is 'usable but thin': 4 active wallets, 1 recurring income, 1 recurring cost, 3 income entries, 4 transactions, all July 2026. The documented consequences: the 'Over time' charts are empty because `hasYearOfData` is false, no 'Needs attention' alerts fire, and no conflict banner appears. Three conditional widgets are never exercised in any screenshot or browser test.

**Question:** Should the test account be seeded with a fuller, deliberately varied dataset?

**Why it matters:** Every visual verification and every future Playwright run is currently blind to the states that matter most — alerts, plan conflicts, a year of history, an over-cap wallet, an overdue payment. The dashboard rebuild in particular cannot be designed against data that never triggers its own alert paths.

**Options I see:**
  (a) Yes — build a repeatable seed script producing a realistic 14-month account.
  (b) Yes, but by hand, once.
  (c) No — verify those states with unit tests instead.

**My recommendation:** (a). It is a prerequisite for the dashboard rebuild and it pays back on every screenshot thereafter. If you choose (a), also answer Q-120 — a seed script is a write, and it needs explicit permission to run unattended.

**ANSWER:**

---

### Q-031 · Part A · Dead columns · Priority: SHOULD

**Context:** Four columns exist in the live DB that nothing reads or writes: `wallets.cap_reduction_enabled` (documented dead, non-null on all 18 wallet rows), `settings.month_start_day` (removed by decision, column left), and `settings.currency` plus `settings.currency_symbol` (the currency picker was reverted in `c6e4f15`). The last two were invisible until the audit's live-DB pass found them (DISC-22) and were **not** documented as dead anywhere. The project convention, recorded in §7, is 'don't migrate dead columns away'.

**Question:** Keep the convention, or clean them up in one migration?

**Why it matters:** The convention is sound, but the count is growing and one of the four was invisible from the repo entirely. The cost of a dead column is not the column — it is the next reader assuming a feature half-exists and wiring something to it.

**Options I see:**
  (a) Keep the convention, and make sure all four are documented as dead in §4.
  (b) One cleanup migration dropping all four.
  (c) Keep the convention, and add a rule: a dead column is documented in §4 the same day it dies.

**My recommendation:** (c). It keeps the (correct) instinct to avoid pointless migrations while closing the failure mode that actually bit — an undocumented dead column that looked live.

**ANSWER:**

---

### Q-032 · Part A · Reset scope · Priority: SHOULD

**Context:** `OPEN-QUESTIONS.md` Q4 — `reset_user_data(p_full)` touches neither the 2026-07-26 import tables nor the 2026-07-30 CSV ones. A full reset removes `recurring_import_links` via FK cascade (because the rules go), but `monthly_balance_snapshots`, `counterparty_wallet_mappings` and `imported_statements` all **survive a full reset**.

**Question:** Should a full reset clear the import tables?

**Why it matters:** The Settings danger-zone copy tells the user what is deleted, and today that copy is not the whole truth. It also determines whether 'start over' leaves stale counterparty-to-wallet learning and boundary snapshots pointing at data that no longer exists.

**Options I see:**
  (a) Yes, all three — a full reset means full.
  (b) Snapshots and statements yes; keep `counterparty_wallet_mappings` (the learning is useful and harmless).
  (c) Leave the function alone and fix the UI copy instead.

**My recommendation:** (a). A 'Full reset' that leaves bank-derived data behind is exactly the kind of surprise the two-tier design was built to eliminate — the decision log's own reasoning for splitting the button was that its copy lied about what it kept.

**ANSWER:**

---

### Q-033 · Part A · Untested branching · Priority: SHOULD

**Context:** `docs/testing-notes.md` decision 3 — `evaluateUnallocatedPlans` is not unit-tested because it is query orchestration rather than pure euro logic; its multi-plan-stall branching is named as 'a candidate for a later integration test'. That branching is the logic deciding whether money moves automatically or stalls.

**Question:** Is the multi-plan stall worth a test, and where would it live?

**Why it matters:** It is the highest-consequence untested branch in the project. `docs/audit/UNDERSTANDING.md` §8 makes the point directly: an agent optimising this would very plausibly 'fix' the more-than-one-eligible case by firing the first plan, which would silently move money the user never approved.

**Options I see:**
  (a) Yes — mock Supabase exactly as `unallocatedPlans.test.js` already does and test the branch directly.
  (b) Yes, but as a real integration test against a test project.
  (c) No — the guard is short enough to read and review.

**My recommendation:** (a). The mocking pattern already exists in that same test file; this is hours, not a phase, and it turns a comment-enforced invariant into a test-enforced one.

**ANSWER:**

---

### Q-034 · Part A · Lint · Priority: SHOULD

**Context:** `OPEN-QUESTIONS.md` Q9 — `npm run lint` exits 1 with 44 problems (33 errors, 11 warnings) across 19 files, and has been red for at least a release cycle. The breakdown: `no-unused-vars` ×12, `react-hooks/static-components` ×11, `react-hooks/exhaustive-deps` ×11, `react-hooks/immutability` ×6, `react-hooks/set-state-in-effect` ×4. CI runs `npm test` only. The eleven `static-components` errors ('Cannot create components during render') are a genuine re-mount bug class, not a style nit.

**Question:** Fix to green, fix only the real-bug rules, or accept red permanently?

**Why it matters:** A documented project command that fails trains everyone to ignore its output — including the PostToolUse hook that runs `eslint --fix` on every edit, which is doing less than it appears while the baseline is red.

**Options I see:**
  (a) Drive it to zero in one pass and add lint to CI.
  (b) Fix only the 21 error-level problems that indicate real bugs (`static-components`, `immutability`, `set-state-in-effect`), and downgrade or ignore the rest.
  (c) Accept the count as a baseline and keep lint out of CI permanently.

**My recommendation:** (b), then add lint to CI at whatever count survives with `--max-warnings` pinned so it cannot regress. Going to zero means also chasing 12 `no-unused-vars` that change nothing, which is how this gets abandoned halfway.

**ANSWER:**

---

### Q-035 · Part A · Bundle size · Priority: NICE

**Context:** `npm run build` passes with one warning: the main chunk is 732 kB (190 kB gzipped) and the pdf.js worker 1.26 MB (`docs/audit/INVENTORY.md` §11). The `Import` route is already code-split via `React.lazy` (`src/App.jsx:102`); nothing else is.

**Question:** Does bundle size matter for this app?

**Why it matters:** On a desktop-only personal tool used daily by one person, no — caching covers it. On a phone over mobile data, 190 kB gzipped before first paint is a real cost. This question is entirely downstream of Q-101.

**Options I see:**
  (a) No — ignore the warning permanently.
  (b) Code-split the remaining heavy routes once mobile matters.
  (c) Do it now.

**My recommendation:** (a) until Q-101 says mobile matters, then (b). Answer Q-101 first.

**Conditional:** Answer after Q-101. If Q-101 is (a), this is (a).

**ANSWER:**

---

### Q-036 · Part A · Dependencies · Priority: NICE

**Context:** After the 2026-09 cleanup removed four unused dependencies (taking the project's only critical advisory with them), `pdfjs-dist` — pinned at `6.1.200` — is the one genuinely-used direct dependency with an open advisory: high severity, fix available at `6.3.289`, a non-major bump (`PROJECT-CONTEXT.md` §8).

**Question:** Take the bump now?

**Why it matters:** `src/lib/import/extractText.js` is the only consumer and it is documented as fragile — the `?url` worker import carries an explicit warning not to replace it, and the file has no tests. The upgrade is low risk but not zero risk.

**Options I see:**
  (a) Bump it, and verify by importing a real PDF (`test-fixtures/` holds four KBC-mobile extracts).
  (b) Leave it pinned until the next import work.
  (c) Bump and unpin to `^6`.

**My recommendation:** (a). Keep the pin — the pin is why the worker wiring has not silently broken — but move it forward, since the fixtures make verification concrete rather than hopeful.

**ANSWER:**

---


## A5. Rule violations

*5 questions — 1 MUST, 1 SHOULD, 3 NICE.*

### Q-037 · Part A · Design tokens · Priority: SHOULD

**Context:** `OPEN-QUESTIONS.md` Q8 / audit DISC-05 — `src/App.jsx` is the only file in `src/` still using raw Tailwind palette classes: `bg-gray-50 dark:bg-gray-950` and `text-gray-400` on the pre-session loading screen (`:71-72`), and `bg-green-500 text-white` on the signup welcome banner (`:84`). `CLAUDE.md` now records the exception explicitly, which means the rule and the code agree only because the rule was amended.

**Question:** Fix the four classes, or keep the amendment?

**Why it matters:** These are the first two views a new user ever sees and both ignore the theme entirely. It is four lines of work.

**Options I see:**
  (a) Fix them — `bg-cream`, `text-ink-muted`, and the `positive` tokens for the banner.
  (b) Keep the `CLAUDE.md` amendment blessing pre-session chrome as outside the token system.
  (c) Leave both the code and the rule as they are.

**My recommendation:** (a). It is the single cheapest item in this questionnaire and it closes a documented exception rather than institutionalising it.

**ANSWER:**

---

### Q-038 · Part A · Balance rule enforcement · Priority: MUST

**Context:** `CLAUDE.md` rule 1 (balances are never computed or written client-side) is honoured everywhere — but by convention only. All three `wallets` update sites (`Wallets.jsx:43`, `WalletDetail.jsx:280`, `Budgeting.jsx:139`) spread a payload built in `WalletModal.jsx:79-83`. Nothing — not a type, not a whitelist, not a DB trigger, not a lint rule — would stop a `balance` key from riding along if one ever entered that payload.

**Question:** Should the rule get a mechanism, and which one?

**Why it matters:** It is the project's single hardest rule and its only enforcement is the `code-reviewer` agent plus your attention. An agent adding a field to `WalletModal` could breach it without touching any line that mentions the word `balance` — which is exactly the kind of violation a diff review misses.

**Options I see:**
  (a) An explicit column whitelist at the three update sites.
  (b) A database trigger rejecting any direct UPDATE of `wallets.balance` outside the RPCs.
  (c) A `design-check`-style grep in the hooks.
  (d) Leave it to review.

**My recommendation:** (a) now — five minutes, no migration — and (b) eventually. The trigger is the only enforcement that survives a future client rewrite, and it is worth noting that full client-side encryption (Q-072) would make this rule unenforceable by any mechanism at all, since balance math would have to move into the browser.

**ANSWER:**

---

### Q-039 · Part A · Charts · Priority: NICE

**Context:** `CLAUDE.md` and `DESIGN-SPEC.md` §6 forbid chart libraries; `src/` is fully compliant with seven components hand-rolling inline SVG and zero library imports. The `vite.config.js` `optimizeDeps` entry that named `recharts` (a package that was never installed) was removed in the 2026-09 cleanup.

**Question:** Is 'inline SVG only' still the rule you want as charts get more ambitious in the dashboard rebuild?

**Why it matters:** `budgetFlowLayout.js` — 237 lines of tested pure geometry feeding a dumb renderer — shows the approach works and produces better-integrated, fully theme-aware charts. It also means every new chart type is hand-built.

**Options I see:**
  (a) Keep the rule — it has produced good results and total theme control.
  (b) Relax it for complex chart types only, with a named library.
  (c) Relax it entirely.

**My recommendation:** (a). The one place a library would plausibly have helped — Sankey geometry — was solved better by a tested pure function than any library would have managed, and the result is unit-testable, which no library chart is.

**ANSWER:**

---

### Q-040 · Part A · Branch protection · Priority: NICE

**Context:** `CLAUDE.md` rule 4 — never push to `main`, always a `b/` branch plus a PR — with the note that 'branch protection is not enforced on the free plan, discipline is the protection'. `PROJECT-CONTEXT.md` §6.3 also carries an outstanding owner action from July: tick 'Require status checks to pass' on the `main` ruleset.

**Question:** Is the free-plan constraint permanent, and is the status-check requirement worth enabling to whatever degree the plan allows?

**Why it matters:** The project has a documented incident where an unresolved merge reached `main` with conflict markers committed in 18 files. The PreToolUse guard blocks push-to-main from Claude Code; the gap is human pushes.

**Options I see:**
  (a) Enable whatever the free plan allows and keep the discipline.
  (b) Pay for the plan that enforces it properly.
  (c) Leave it as is.

**My recommendation:** (a). It costs nothing and it closes the one path the guard hook cannot see.

**ANSWER:**

---

### Q-041 · Part A · Rule set currency · Priority: NICE

**Context:** The audit checked all seven `CLAUDE.md` non-negotiables against the code. All seven hold, with the single App.jsx exception in Q-037. But the list was written before the import subsystem, the Budgeting page and this audit existed.

**Question:** Are there rules you want **added** to `CLAUDE.md` as a result of this audit?

**Why it matters:** Candidates the audit surfaced: 'transaction-amount edits reverse through an RPC, never a client pair' (Q-019); 'a dead column is documented in §4 the day it dies' (Q-031); 'money rounding uses the shared helper' (Q-005).

**Options I see:**
  (a) Add all three.
  (b) Add only the RPC one.
  (c) None — the list's value is that it is short.

**My recommendation:** (b). The brevity of the list is load-bearing: seven rules get read, fifteen get skimmed. Only add a rule that prevents a money defect.

**ANSWER:**

---


## A6. Test coverage

*7 questions — 2 MUST, 3 SHOULD, 2 NICE.*

### Q-042 · Part A · recurringAmountUpdate · Priority: MUST

**Context:** `OPEN-QUESTIONS.md` Q5 — `src/lib/recurringAmountUpdate.js` (111 lines) writes to the database, re-versions recurring rules by archive-plus-successor, and carries an error-recovery path that restores the archived rule if the successor insert fails (and raises a specifically worded error if *that* also fails). Its own header calls it 'the ONE definition of that write'. It has **zero tests**. It is shared by the Income page and the CSV import's deviation flow.

**Question:** Is closing this the next piece of testing work, and does the error-recovery path need a test specifically?

**Why it matters:** It is the largest coverage gap in the project weighted by risk — larger than any page. It is also where Q-028's non-idempotence lives, so the tests and the guard are naturally one piece of work.

**Options I see:**
  (a) Yes — mirror the `distributeIncome.test.js` mocking pattern and cover the happy path, the restore path, and a double run.
  (b) Yes, but the happy path only.
  (c) No — cover it when the import flow is exercised on real data (Q-010).

**My recommendation:** (a). The restore path only runs when something has already gone wrong, which is precisely when you want it to have been tested.

**ANSWER:**

---

### Q-043 · Part A · Component tests · Priority: MUST

**Context:** `OPEN-QUESTIONS.md` Q6 — nothing under `src/pages/` or `src/components/` is tested; roughly 9,000 lines of JSX with zero coverage. `vitest.config.js` sets `include: ['src/**/*.test.js']` in the `node` environment, so a `.test.jsx` would not even be collected and React components cannot render. Adding coverage needs jsdom, `@testing-library/react`, and a change to that glob.

**Question:** Do you want component or page tests at all, and if so what triggers the investment?

**Why it matters:** It gates the page-split refactor (Q-049) and it is the difference between 'the money logic is protected' and 'the app is protected'. It is also the prerequisite most often cited as a reason not to do something else.

**Options I see:**
  (a) Yes, now — set up jsdom plus testing-library and cover `DistributionPopup` first.
  (b) Yes, but only as a prerequisite to the page split, not before.
  (c) No — keep the suite pure and lean on browser verification.
  (d) No component tests, but add Playwright smoke flows instead.

**My recommendation:** (b) for the infrastructure, with (a)'s target when it happens. `DistributionPopup` is mounted by four pages in four modes with fifteen props — it is the one component where a test pays back fastest. If (c) or (d), Q-049 becomes 'leave them' by default.

**ANSWER:**

---

### Q-044 · Part A · dashboardCalcs now-seam · Priority: SHOULD

**Context:** `OPEN-QUESTIONS.md` Q7 — `src/lib/dashboardCalcs.js` is 268 lines and 10 exports with **6 tests**, because `new Date()` is read internally at `:32`, `:76`, `:125` and `:163` with no injectable parameter. Compare `walletMetrics.js`: 67 lines, 3 exports, 12 tests, because it takes `now = new Date()`. The seam is already agreed — twice, in `docs/testing-notes.md` and in §7 — to be threaded during the dashboard rebuild rather than bolted on.

**Question:** Does that deferral still hold, or should the seam be threaded now?

**Why it matters:** The deferral was recorded in July on the assumption the rebuild was imminent. If the rebuild slips again, this stays untested indefinitely — and threading the parameter is mechanical work that is completely independent of any redesign decision.

**Options I see:**
  (a) Hold the deferral — the rebuild will rework these functions anyway.
  (b) Thread `now` now as a standalone change with tests, so the rebuild inherits a tested baseline.
  (c) Thread it only through the four internal readers and leave the rest.

**My recommendation:** (b), if the rebuild is more than a month away. A rebuild against tested functions is materially safer than one against untested functions, and the original rationale ('avoid churn on code that phase will rework') weakens every month the phase does not start.

**ANSWER:**

---

### Q-045 · Part A · RPC testing · Priority: SHOULD

**Context:** The four database functions carrying the app's atomicity guarantees — `import_transactions`, `edit_income_distribution`, `reset_user_data`, `distribute_from_unallocated` — have no automated test. Each was verified once by hand against the live DB; nothing re-checks them. Testing them is awkward: `auth.uid()` is null when SQL runs through the connector, so a test must set `request.jwt.claims` in a DO block (`PROJECT-CONTEXT.md` §8).

**Question:** Should the RPCs get an automated test harness?

**Why it matters:** They hold precisely the guarantees the client deliberately does not. If Q-018 moves more logic into RPCs, this gap grows with it. And if encryption ever moves that math into the browser, these tests are the migration's parity check.

**Options I see:**
  (a) Yes — pgTAP or a scripted SQL suite run against a Supabase branch.
  (b) Yes but lighter — a `db-verifier`-style read-only invariant script run after every money-touching change.
  (c) No — hand verification on change is enough at this scale.

**My recommendation:** (b). It gets most of the value without a new toolchain, and the `db-verifier` agent already exists to run it. Note (a) is impossible unless Q-060 produces a baseline migration — you cannot create a test database from this repo today.

**ANSWER:**

---

### Q-046 · Part A · Behaviour-test discipline · Priority: SHOULD

**Context:** `docs/testing-notes.md` and §7 both state that tests must be behaviour tests, not implementation tests, explicitly so they survive the encryption migration — 'the correct euro answer is the same whether the math runs in SQL or the browser'. All 352 tests hold that line, including the executor tests which aggregate mocked RPC calls into per-wallet euro totals rather than asserting call shape.

**Question:** If encryption is dropped or parked indefinitely (Q-072), does the behaviour-test discipline still earn its constraints?

**Why it matters:** The discipline has a real cost: aggregating calls rather than asserting them makes some failures harder to localise. If its headline justification disappears, it is worth asking whether it is still the right trade rather than inheriting it unexamined.

**Options I see:**
  (a) Yes — it is good practice regardless and the reasoning stands on its own.
  (b) Relax it where a targeted implementation test would diagnose a failure faster.
  (c) It was only ever for encryption — revisit if encryption is out.

**My recommendation:** (a). The aggregation pattern also survives the RPC-ification in Q-018, which is a far more likely future than encryption — the tests would keep passing unchanged as the loop moves into the database, which is exactly what you want.

**ANSWER:**

---

### Q-047 · Part A · CI scope · Priority: NICE

**Context:** CI (`.github/workflows/test.yml`) runs on pull requests and pushes to `main`, and runs `npm test` only — not `npm run build`, not `npm run lint`. The build has caught real breakage in this project: the R2 reskin used it as the gate for broken JSX and undefined references.

**Question:** Add `npm run build` to CI?

**Why it matters:** It is a three-second check that catches a class of error the test suite structurally cannot see — no test imports a `.jsx` file, so nothing in the suite would notice a broken component.

**Options I see:**
  (a) Yes, add build now.
  (b) Add build and lint together once Q-034 settles.
  (c) No.

**My recommendation:** (a) immediately, independent of the lint decision. There is no argument for waiting — build already passes, so adding it cannot break anything.

**ANSWER:**

---

### Q-048 · Part A · pdf.js edge · Priority: NICE

**Context:** `src/lib/import/extractText.js` (64 lines) is the single impure module in the import pipeline and is documented as untestable in the node environment (pdf.js plus a `?url` worker import). `test-fixtures/` holds four real KBC-mobile `.txt` extracts and a 42-row CSV, but no PDF.

**Question:** Is it worth making the pdf.js edge testable — one committed anonymised PDF fixture and one test in a browser environment?

**Why it matters:** It is the only place a `pdfjs-dist` upgrade (Q-036) could break silently, and text extraction is where a format change would first show up.

**Options I see:**
  (a) Yes — one PDF fixture plus one browser-mode Vitest test.
  (b) No — verify manually after any pdf.js bump.
  (c) No, and remove the ambition from the notes.

**My recommendation:** (b). A second test environment for one function is a lot of machinery; a documented manual check tied to the version bump is proportionate, and Q-036's answer already creates that moment.

**ANSWER:**

---


## A7. My suggestions

*8 questions — 0 MUST, 4 SHOULD, 4 NICE.*

### Q-049 · Part A · Oversized pages · Priority: SHOULD

**Context:** `docs/audit/STRUCTURE-REVIEW.md` found `src/` structurally sound and proposed no moves, but recorded one real finding: `Income.jsx` (1225 lines), `Import.jsx` (1194) and `WalletDetail.jsx` (989) are too large, and `WalletDetail.jsx` branches four distinct wallet behaviours in one component — fixed, variable, investment (`:461`) and unallocated (`:468`). Each of the three holds 21–28 `useState` hooks with sequenced DB writes. The split was deliberately not proposed, and is gated in §7 behind component tests and the unmerged Budgeting branch.

**Question:** Do you want these split, and if so in what order and behind what safety net?

**Why it matters:** They are the three files an agent is most likely to damage and the most expensive to hold in context. But the project has a documented history of a merge that passed the build and still crashed the app at runtime, and none of these files has a single test.

**Options I see:**
  (a) Split `WalletDetail.jsx` first, by wallet type, once component tests exist.
  (b) Split all three, in size order, once component tests exist.
  (c) Extract only the modals and sub-views that are already self-contained, without the test prerequisite.
  (d) Leave them.

**My recommendation:** (a). `WalletDetail` is the only one where the split follows a seam that already exists visibly in the JSX. If Q-043 is (c) or (d), this becomes (d) by default — do not split untested 1,000-line files.

**Conditional:** If Q-043 is (c) or (d), this is (d).

**ANSWER:**

---

### Q-050 · Part A · src/ structure · Priority: NICE

**Context:** `docs/audit/STRUCTURE-REVIEW.md` verified rather than assumed: `lib/` never imports upward from `components/` or `pages/`, `components/` never imports from `pages/`, there are no circular imports across the 31 non-test lib modules, and a `hooks/` directory would hold two one-line `useContext` wrappers. 32 of 96 tracked `src/` files import from `lib/` and 9 from `components/`, so renaming either rewrites imports in at least 41 files.

**Question:** Confirm you are happy leaving `src/` alone — or is there something specific that annoys you when working in it?

**Why it matters:** I found no problem worth a 41-file diff, but I am reading the code, not living in it. A concrete annoyance from you beats my analysis.

**Options I see:**
  (a) Leave it — nothing annoys me.
  (b) Something specific does, and I will name it.
  (c) I want feature folders anyway.

**My recommendation:** (a), unless you can name a symptom. 'Cleaner' is not worth a whole-codebase diff in a project with this merge history — and the audit could not find a symptom to name on your behalf.

**ANSWER:**

---

### Q-051 · Part A · Hand-rolled choices · Priority: NICE

**Context:** The project deliberately hand-rolls three things a library would normally do: the money formatter (`src/lib/format.js`, 47 lines — `Intl` emits a non-breaking space and varies by ICU version, making the spec string non-deterministic), the CSV tokenizer (`src/lib/import/csv.js`, 72 lines — the real export has zero quoted fields, so papaparse would have bought a `split(';')`), and every chart (inline SVG). All three have explicit reasoning in §7.

**Question:** Do any of them still feel like the wrong call in hindsight?

**Why it matters:** I read the reasoning and agree with all three, so I am asking rather than proposing. Hand-rolled code you regret is a different problem from hand-rolled code you chose, and only you know which this is.

**Options I see:**
  (a) All three still right.
  (b) One of them was a mistake — I will say which.
  (c) Revisit if a fourth one appears.

**My recommendation:** (a). Each decision names a concrete failure the library would have caused rather than a general preference, which is the strongest form of this argument and the rarest.

**ANSWER:**

---

### Q-052 · Part A · Formatter · Priority: SHOULD

**Context:** §7 records that 'a dedicated formatter (Prettier) is a candidate for the testing phase'. The testing phase shipped without it. The PostToolUse hook runs `eslint --fix` on edited `.js`/`.jsx` files, non-blocking.

**Question:** Add Prettier?

**Why it matters:** With one maintainer and an auto-fix hook already running, formatting drift is not currently a visible problem — but an `eslint --fix` hook on a codebase whose lint baseline is red is doing less than it appears.

**Options I see:**
  (a) Yes — it removes a class of diff noise permanently.
  (b) No — the hook is enough.
  (c) Yes, but only after Q-034 gets lint to a known state.

**My recommendation:** (c). Adding a formatter to a codebase with 33 lint errors reformats everything at once and buries the real errors inside a whole-repo diff — the exact situation `verify-merge` exists to warn about.

**ANSWER:**

---

### Q-053 · Part A · DB access friction · Priority: SHOULD

**Context:** The Supabase MCP needs OAuth authorization each session, and a long-running session caches a dead `client_id` in memory — the fix is restarting Claude Code, which `CLAUDE.md` now documents after the audit hit it. Two of this operation's six sessions were partly blocked on it. The `db-verifier` agent depends on it and is the project's only data-invariant check.

**Question:** Is there a lower-friction way to give sessions read-only DB access, and do you want one?

**Why it matters:** A verification step that is annoying to run is a verification step that quietly stops being run — and that is the step guarding your money invariants.

**Options I see:**
  (a) Accept the OAuth step as the cost of not storing a credential.
  (b) Put a read-only Postgres connection string in `.env.local` for a scripted invariant check, keeping the MCP for exploration.
  (c) No change.

**My recommendation:** (b), paired with Q-045 (b). A scripted read-only check is also what makes the invariants runnable in CI later, which the MCP never can be.

**ANSWER:**

---

### Q-054 · Part A · Doc size · Priority: NICE

**Context:** `PROJECT-CONTEXT.md` is 1,133 lines after the audit rewrite. §6.3 alone is 279 lines of narrative record of phases that shipped between 9 and 30 July; §7 is 225 lines of decision log. The file's own §0 exists to explain how to read it, and it is pasted into every new chat.

**Question:** Should §6.3's shipped-phase narrative move to a separate history file, leaving §6 as the status tables only?

**Why it matters:** The file is loaded into limited context windows by every new chat and every Claude Code session. §6.3 is the part least likely to be needed and the largest part that only grows.

**Options I see:**
  (a) Yes — move §6.3 to `docs/history.md`, leave §6.1/§6.2 plus a pointer.
  (b) No — the reasoning lives with the status, and splitting invites exactly the drift the audit just fixed.
  (c) Trim §6.3 to one paragraph per phase rather than moving it.

**My recommendation:** (b). The audit's central finding was that status split across files drifts within weeks. If size becomes a real problem, (c) is the safer lever — it keeps one home while cutting the bulk.

**ANSWER:**

---

### Q-055 · Part A · Repo presentation · Priority: NICE

**Context:** `README.md` was rewritten during the audit (41 lines) to describe the app, how to run it, and the reading order. It is the front page of a private repo with one maintainer, alongside a 12-chapter course written for an outside reader.

**Question:** Does the repo need to present well to anyone other than you?

**Why it matters:** It changes how much polish the README, the course (Q-017) and any onboarding material deserve — and whether this project is ever shown to anyone.

**Options I see:**
  (a) Private forever — the README is for future-me.
  (b) It may be shown to employers or collaborators — keep it presentable.
  (c) It may go public one day.

**My recommendation:** No strong view, but answer it before Q-065 — it is the same question at a smaller scale, and (b) would make the course worth finishing rather than freezing.

**ANSWER:**

---

### Q-056 · Part A · Error visibility · Priority: SHOULD

**Context:** The app has no error reporting and no shared error surface. Failures show up as unhandled promise rejections in the console — `PROJECT-CONTEXT.md` §8 names two patterns that produce exactly this — or as a modal stuck in a committing state with the button disabled and nothing on screen. The documented verification method is 'run the app and check the browser console'.

**Question:** Is any user-facing error visibility worth adding — a toast on failed writes, or a real error reporter?

**Why it matters:** Three of this file's money-path questions (Q-018, Q-019, Q-024) describe failures that are currently silent to the user. Fixing the atomicity without fixing the silence means the user still cannot tell when something went wrong; fixing the silence without the atomicity at least tells them to look.

**Options I see:**
  (a) A shared toast / error surface for failed writes. No external service.
  (b) (a) plus an error reporter (e.g. Sentry free tier).
  (c) Neither — the console is fine for one user.

**My recommendation:** (a). It is the missing half of every atomicity fix in section A3, it needs no third party — which matters given the privacy stance in B6 — and it is a single component plus a context.

**ANSWER:**

---


## A8. Data and schema

*8 questions — 1 MUST, 4 SHOULD, 3 NICE.*

### Q-057 · Part A · budget_allocations · Priority: SHOULD

**Context:** `budget_allocations` exists in the live DB with a full shape (`user_id`, `wallet_id`, `amount` numeric NOT NULL, `valid_from` date NOT NULL, `valid_until` date, `created_at`), **0 rows**, and no read or write anywhere in `src/` — confirmed by grep in Session 1 and by live query on 2026-09-14 (audit DISC-20). It is still deleted by `reset_user_data`, named in the backup plan's export list, and `docs/dashboard-recon.md` §2 warns a redesign not to assume it.

**Question:** Drop it, or keep it as a designed-but-unused slot for time-boxed budgets?

**Why it matters:** A table with a coherent shape and no users is an invitation to build the wrong thing on it — the shape implies a per-period budget model that competes directly with `wallets.budget`, which is what the app actually uses.

**Options I see:**
  (a) Drop it in a migration.
  (b) Keep it, documented in §4 as reserved for time-boxed budgets.
  (c) Keep it and actually build time-boxed budgets.

**My recommendation:** (a), unless Q-085 says time-boxed budgets are genuinely wanted. It is the only table in the schema with no purpose in the running app. Answer Q-085 first.

**Conditional:** Answer after Q-085.

**ANSWER:**

---

### Q-058 · Part A · Conflict history · Priority: NICE

**Context:** `unallocated_pending_conflicts` drives the whole conflict-stall mechanism — written at `unallocatedPlans.js:103`, read at `:61` and `:91`, resolved by `UnallocatedConflictBanner.jsx:65,77` — and carries `status`, `chosen_plan_id` and `resolved_at`. Resolved rows are never deleted, and nothing displays them. It is cleared by both tiers of `reset_user_data`.

**Question:** Should resolved conflicts be retained as history, or cleaned up?

**Why it matters:** They are currently permanent rows with no UI at all. If they are history, something should show them; if they are not, they should be cleared on resolve.

**Options I see:**
  (a) Retain, and surface them in the Unallocated history tab.
  (b) Delete on resolve.
  (c) Retain silently — they are small and might be useful one day.

**My recommendation:** (a). A stall is a moment when the app declined to move money and asked you to choose — that is exactly the kind of event a history tab exists for, and it pairs naturally with the plan-firing log in Q-003.

**ANSWER:**

---

### Q-059 · Part A · wallets.colour · Priority: SHOULD

**Context:** `wallets.colour` is still written by `WalletModal.jsx:79` from a default, still stored, and read by nothing — wallet identity became the icon in R2. `DESIGN-SPEC.md` §2 still instructs 'Map existing wallet `colour` values onto these families', which the audit flagged as stale (DISC-21) while noting the five ramps themselves remain live for flow-diagram source colours (per income, not per wallet).

**Question:** Stop writing `colour`, or bring it back as a user choice?

**Why it matters:** §7 records that you disliked the colour picker, and the density pass chose one coral identity over the mockup's per-wallet rainbow. Meanwhile a live write to a column nothing reads is the sort of thing that convinces the next reader a feature exists.

**Options I see:**
  (a) Stop writing it, mark the column dead in §4, and fix the stale `DESIGN-SPEC.md` sentence.
  (b) Leave it written — harmless, and a future rainbow might want it.
  (c) Reintroduce per-wallet colour as an option alongside the icon.

**My recommendation:** (a). It is the last live write to a column nothing reads, and the spec sentence is actively misleading to anyone implementing new wallet UI.

**ANSWER:**

---

### Q-060 · Part A · Baseline migration · Priority: MUST

**Context:** The base schema has **no migration file at all**: `wallets`, `transactions`, `income_entries`, `income_recurring`, `income_templates`, `recurring_rules`, `budget_allocations`, `settings`, all four `unallocated_*` tables, `unallocated_pending_conflicts`, `income_distribution_rules`, `income_template_distribution_items`, the `handle_new_user()` signup trigger, and the four core balance RPCs. `supabase/migrations/` starts at 2026-07-09 and holds six files, and nothing applies them automatically — the owner runs each by hand (`PROJECT-CONTEXT.md` §8).

**Question:** Is it worth capturing the current live schema as a baseline migration?

**Why it matters:** Today a new environment cannot be created from this repo at all — not a test project, not a Supabase branch for the RPC tests in Q-045, not a restored backup. That single constraint blocks several other answers in this file, and it means the repo does not describe the thing it deploys.

**Options I see:**
  (a) Yes — dump the live schema once into `supabase/migrations/00000000000000_baseline.sql` and treat later files as incremental.
  (b) Yes, and adopt the Supabase CLI / `db push` properly.
  (c) No — the live DB is the source of truth and always will be.

**My recommendation:** (a). It is a read-only dump plus one commit. It makes the migrations folder honest, and it is the prerequisite for testing the RPCs (Q-045 (a)), for a separate test project (Q-113 (b)), and for disaster recovery. If (c), then Q-045 (a) and Q-113 (b) are both impossible and should be answered accordingly.

**ANSWER:**

---

### Q-061 · Part A · settings.bank_provider · Priority: NICE

**Context:** `settings` carries `bank_provider` with a CHECK, added by the 2026-07-26 import migration, alongside the three dead columns from Q-031. `SUPPORTED_BANKS` in `detectBank.js` currently contains one bank.

**Question:** Is `bank_provider` doing real work, or is it the same shape as `currency` — a column for a feature with one possible value?

**Why it matters:** It is a stored preference between one option. The difference from `currency` is that it is actually read (`Import.jsx:153`), so it is not dead — but it is not yet load-bearing either.

**Options I see:**
  (a) Keep — a second bank is plausible and the column will be needed.
  (b) Mark it as reserved, the way `imported_statements` should be (Q-009).
  (c) Drop it.

**My recommendation:** (a). Unlike `currency` it is read at runtime, and it is the natural extension point for whatever Q-004 decides about a second bank.

**ANSWER:**

---

### Q-062 · Part A · Query patterns · Priority: SHOULD

**Context:** Every page fetches with `select('*')` and aggregates client-side. The dashboard alone fetches six tables on mount with no server-side aggregation (`docs/dashboard-recon.md` §1). `PROJECT-CONTEXT.md` §8 puts the Supabase free-tier ceiling at roughly 200–250 active users, egress-bound, at about 250 rows per user per month.

**Question:** Is the fetch-everything pattern fine permanently, and at what point would it stop working?

**Why it matters:** It determines whether the dashboard rebuild can keep computing client-side, whether encryption's 'the browser does the math' cost is acceptable (it is, at this scale), and whether pagination ever needs to exist anywhere.

**Options I see:**
  (a) Free tier and single-digit users permanently — fetch-everything is fine forever.
  (b) Free tier for now, but design for a few hundred users.
  (c) Will pay and scale if it grows.

**My recommendation:** (a), unless Q-065 says this becomes a product. At one user with a few thousand rows, client-side aggregation is genuinely faster than a round trip, and designing for scale you will not reach is how simple apps get complicated.

**ANSWER:**

---

### Q-063 · Part A · Invariants · Priority: SHOULD

**Context:** The `db-verifier` agent exists to check data invariants read-only after money-touching flows, and §6.3 records real passes (0.00 balance drift across five wallets, both new import tables empty and constraint-sound). But the invariants themselves live in the agent's markdown prompt, not as committed SQL.

**Question:** What is the definitive list of invariants, and should it be version-controlled as SQL?

**Why it matters:** An invariant that lives in an agent prompt cannot be run in CI, cannot be diffed, and quietly changes meaning as the prompt is edited. I can name four from the artefacts — balance equals the sum of confirmed transactions per wallet; every income entry's credits sum to its amount; no orphaned distribution rows; `user_id` non-null everywhere — but not authoritatively, and there are references to 'invariants 1, 2 and 5' that I could not fully reconstruct.

**Options I see:**
  (a) Write them as a committed read-only SQL script the agent runs.
  (b) Keep them in the agent prompt.
  (c) Both — the script is the source, the prompt points at it.

**My recommendation:** (c). It is also what makes Q-045 (b) and Q-053 (b) possible, and it means the numbered invariants in §6.3 finally refer to something you can open.

**ANSWER:**

---

### Q-064 · Part A · Paid/unpaid model · Priority: NICE

**Context:** There is no explicit due/paid status column. A recurring payment counts as paid when a matching `transactions` row exists for that `recurring_rule_id` and date with `is_confirmed = true`; unpaid or overdue means the row is missing or unconfirmed. That inference feeds `getOverduePayments` and `unpaidUpcomingCosts`, which drive the dashboard's most prominent alert (`docs/dashboard-recon.md` §2f).

**Question:** Is the inferred paid/unpaid model working in real use, or does it produce wrong 'overdue' claims?

**Why it matters:** It is the one place the app's data model does not directly store something its UI asserts. Only you can answer it, from actually using the app — a false overdue is invisible to code review and obvious to a user.

**Options I see:**
  (a) Works fine.
  (b) It produces false overdues — I will describe when.
  (c) I do not look at that section.

**My recommendation:** No recommendation — this is a pure observation question. (c) is a genuinely useful answer for the dashboard rebuild, because a section you ignore is a section to cut.

**ANSWER:**

---


# Part B — where we are going

These come to you rather than from the code. Where the documentation appears to answer one
already, the question is still asked — the documentation is what this operation replaced.


## B1. Definition of done

*5 questions — 3 MUST, 2 SHOULD, 0 NICE.*

### Q-065 · Part B · What this is · Priority: MUST

**Context:** The code reads as a single-household envelope-budgeting app for one person: no sharing, no household, no invites. Every table is `user_id`-scoped with four `{table}_{cmd}_own` RLS policies, so two users have entirely disjoint datasets — multi-user exists as isolation, not collaboration (`docs/audit/UNDERSTANDING.md` §1). Meanwhile signup is open with email verification, and the free tier supports roughly 200–250 users.

**Question:** Is this a personal tool that happens to have multi-user support, or a product intended for people beyond you?

**Why it matters:** This is the single answer that scales every other answer in this file — how much error handling, how much onboarding, whether the free-tier ceiling is a real constraint, whether admin-visible data is acceptable, whether account deletion is required, and what 'polished' means.

**Options I see:**
  (a) Personal tool, permanently — multi-user is deployment hygiene.
  (b) Personal, but I would let friends or family use it.
  (c) A real product I intend other people to use.

**My recommendation:** No recommendation — this one is genuinely yours. But note that the code currently assumes (a) everywhere it makes a trade-off, and answering (c) would reopen roughly a third of this questionnaire (onboarding, account deletion, encryption, scale, signup, domain, error reporting).

**ANSWER:**

---

### Q-066 · Part B · Stopping point · Priority: MUST

**Context:** The app is already in real use — the live DB holds 18 wallets, real Unallocated plans and templates, and the owner's account has been active since June. Yet the roadmap still carries three unbuilt phases, two of which (backup, encryption) are infrastructure rather than features you would notice day to day.

**Question:** What would you be happy to stop at? Describe the version where you would say 'that's it, I just use it now'.

**Why it matters:** 'Done' is the only thing that turns the remaining scope into a finite list. Without it a roadmap can only grow, and this one has not lost an item since July.

**Options I see:**
  (a) Essentially done — the dashboard rebuild, then maintenance.
  (b) Done once backup exists.
  (c) Done once encryption exists.
  (d) There is a specific feature still missing, which I will name.

**My recommendation:** No recommendation. But if (a) or (b), several sections below shorten dramatically, and that is worth knowing before any further building.

**ANSWER:**

---

### Q-067 · Part B · What is missing · Priority: MUST

**Context:** The audit can find gaps from the code, but not the ones that annoy you in daily use. The three I would guess from the artefacts: the dashboard has no top-line summary (`docs/dashboard-recon.md` §5), there is no mobile view at all (`Layout.jsx:35`), and an investment wallet's detail page shows nothing (`WalletDetail.jsx:461`).

**Question:** What would make you call this incomplete? What is missing that actually bothers you when you use it?

**Why it matters:** This is the question I would most want answered if I could only ask one. Everything else in this file is derived from the code; this is the only place the answer can come from you using the thing.

**Options I see:**
  (Free text — but if any of the three guesses above are right, saying so is enough.)

**My recommendation:** None.

**ANSWER:**

---

### Q-068 · Part B · Onboarding · Priority: SHOULD

**Context:** There is no onboarding. A new user gets a signup trigger that creates a settings row and an Unallocated wallet, then lands on a dashboard whose empty state is the string 'Nothing here yet' (`docs/dashboard-recon.md` §1).

**Question:** Does onboarding matter?

**Why it matters:** Directly downstream of Q-065. If that is (a), this is a firm no. Anything else and the first-run experience is currently a blank page next to an empty sidebar.

**Options I see:**
  (a) No — I am the only user and I know how it works.
  (b) A minimal first-run guide (create a wallet, add an income).
  (c) Real onboarding with sample data.

**My recommendation:** (a) if Q-065 is (a). If Q-065 is (b) or (c), go to (b) — (c) is a product-sized investment and the wallet model needs explaining more than the UI does.

**Conditional:** If Q-065 is (a), this is (a).

**ANSWER:**

---

### Q-069 · Part B · Production bar · Priority: SHOULD

**Context:** The app is deployed on Vercel from `main` with an SPA rewrite. There is no error reporting, no analytics, no uptime check. The only way to learn something broke is to use it and notice (Q-056).

**Question:** What does 'in production' mean for this app — is there a standard you hold it to, or is breakage just something you fix when you hit it?

**Why it matters:** It sets the bar for Q-056 and for how much defensive work the atomicity questions in section A3 actually deserve. If silent failure is acceptable, several recommendations downgrade.

**Options I see:**
  (a) I fix it when I notice — that is fine.
  (b) I want to know when a write fails, inside the app.
  (c) I want to know when a write fails, out of band (email, alert).

**My recommendation:** (b). It is the version that costs one toast component and nothing else, and it is what makes the A3 fixes meaningful rather than invisible.

**ANSWER:**

---


## B2. Remaining scope

*11 questions — 5 MUST, 6 SHOULD, 0 NICE.*

### Q-070 · Part B · Dashboard rebuild · Priority: MUST

**Context:** `PHASE-ROADMAP.md` Phase A — the dashboard rebuild, CHAT-FIRST, with recon written 2026-07-16 and still accurate except for nine baseline screenshots deleted in the 2026-09 cleanup and needing re-capture. `docs/dashboard-recon.md` §5 calls the 30-day projection 'the one true hero' and names three concrete problems: duplicate 'Needs attention', no top-line summary, and a misleading six-month outlook.

**Question:** Is the dashboard rebuild still wanted, in this shape, and where does it rank?

**Why it matters:** It is the only phase with recon already done and the only one where the audit found specific, nameable problems to fix. It also carries the `now`-injection testing prerequisite (Q-044), and it is the screen you look at most.

**Options I see:**
  (a) Yes, next — the highest-value remaining work.
  (b) Yes, but after the money-path atomicity work in A3.
  (c) Scale it down to the three named fixes rather than a rebuild.
  (d) No longer wanted.

**My recommendation:** (a) or (c). The recon's three findings are most of the value at a fraction of the cost; a full rebuild only earns its keep if you have a genuinely different answer to Q-086 ('what should the first screen say'). Answer Q-086 first, then come back to this.

**Conditional:** Answer after Q-086.

**ANSWER:**

---

### Q-071 · Part B · Backup / restore · Priority: MUST

**Context:** `PHASE-ROADMAP.md` Phase B — backup and export/import, plan at `docs/plans/backup-restore-feature-plan.md`, written 2026-07-07. It predates the two-tier reset, the four `unallocated_*` tables, both import sources and the whole redesign, and its export list names `budget_allocations` (0 rows, unused). It is the stated prerequisite for encryption.

**Question:** Still wanted, and does it rank above the dashboard?

**Why it matters:** Its standalone value — data portability and disaster recovery — is real even without encryption, but it is invisible in daily use. Its strategic value disappears entirely if encryption is dropped (Q-072).

**Options I see:**
  (a) Yes, and it goes first — my data is not backed up and that bothers me.
  (b) Yes, after the dashboard.
  (c) Only if encryption happens.
  (d) No — Supabase's own backups are enough.

**My recommendation:** (a) if you have no export today and the data matters to you; otherwise (b). Before choosing (d), check what point-in-time recovery your Supabase plan actually gives you — on the free tier it is less than people assume, and your own app has an OTP-gated 'Full reset' button.

**ANSWER:**

---

### Q-072 · Part B · Client-side encryption · Priority: MUST

**Context:** `PHASE-ROADMAP.md` Phase C — client-side encryption, plan at `docs/plans/encryption-with-key-plan.md`, scoped in its own words as 'substantial, comparable to or larger than the multi-user work'. Two open discussions remain unresolved inside it: balance atomicity without DB-side math, and which features lose DB-side filtering and sorting.

**Question:** Still wanted, at what priority, and in what scope?

**Why it matters:** It is the largest item on the books and the only one that would force a rewrite of the money layer — the same layer sections A3 and A6 want to move *further into* the database. Those two directions are in direct tension and only one can win. Deciding this settles Q-018, Q-038, Q-045 and Q-046 at the same time.

**Options I see:**
  (a) Full encryption as planned.
  (b) Partial — encrypt names and notes, leave amounts and balances plaintext so the RPCs survive.
  (c) Parked indefinitely.
  (d) Dropped, and remove the plan from the roadmap.

**My recommendation:** (b) or (c). Note the tension explicitly: Q-018 and Q-038 recommend moving *more* money logic into atomic database functions, and full encryption requires moving all of it out — including the balance RPCs that are the project's hardest rule. (b) is the version that costs nothing architecturally, because names and notes are never summed, sorted or compared by the database. If (c) or (d), skip Q-107 and Q-109.

**ANSWER:**

---

### Q-073 · Part B · Privacy mode · Priority: SHOULD

**Context:** Privacy mode shipped session-only in PR #10 — a module-level flag in `src/lib/format.js:16` masking to `€ ••••` and `€••`, reset to visible on reload by design, with `format.js:12-16` saying so explicitly. There is no `hide_balances` column, and the audit's live-DB pass confirmed none exists (DISC-23). The original plan called for one; the implementation deliberately diverged and nobody recorded whether that divergence is final.

**Question:** Should privacy mode persist across reloads?

**Why it matters:** It is a small, cheap decision that has been implicitly open since July, and the roadmap used to carry a migration for it that must never be written.

**Options I see:**
  (a) Session-only is right — it is a shoulder-surfing toggle, not a preference.
  (b) Persist it per device in `localStorage`.
  (c) Persist it in `settings` as a real preference.

**My recommendation:** (a). A privacy toggle that survives a reload eventually surprises you by hiding your own numbers when you had forgotten it was on. If you want (b) it is roughly ten lines and no migration; (c) buys nothing (b) does not.

**ANSWER:**

---

### Q-074 · Part B · Investment wallets · Priority: SHOULD

**Context:** `PHASE-ROADMAP.md` Parked — 'Investment wallet type (phase 7 of the old numbering)'. Unlike everything else parked, this one already has code in the app: the type is creatable, fundable, listed and iconed, with a detail page that says 'coming in Phase 7' (Q-008).

**Question:** Is the investment wallet type still wanted, and what would it actually do?

**Why it matters:** It is the only parked item with half-built code sitting in production. Everything else parked is unstarted, which is a much cheaper state to leave something in.

**Options I see:**
  (a) Yes — manual valuation over time, contributions versus current value.
  (b) Yes, minimally — just a balance and history like any other wallet.
  (c) No — remove the type.

**My recommendation:** (b). It closes the dead-end page with no new concepts and no schema change, and (a) can follow later if you ever want real valuation tracking.

**ANSWER:**

---

### Q-075 · Part B · AI features · Priority: SHOULD

**Context:** `PHASE-ROADMAP.md` Parked — 'AI features (natural-language transaction entry)'. The roadmap records that the PDF-import phase considered and **rejected** Claude-API extraction in favour of a deterministic parser, because bank statements are sensitive — so the rails for 'an AI writes transactions safely' were never built.

**Question:** Still wanted, and does the rejection reasoning still apply?

**Why it matters:** Natural-language entry writes money, so it needs the same rails the import pipeline has (preview, explicit confirm, nothing auto-committed) plus a reason to trust a model's parse. That is a substantial build, not a small add-on.

**Options I see:**
  (a) Yes — natural-language entry for hand-typed transactions (not statements), with a mandatory preview.
  (b) Yes, but a different AI feature which I will name.
  (c) No.

**My recommendation:** (c) for now, or (a) strictly scoped. The sensitivity argument that killed it for statements does not apply to typing '€12 lunch' — but the write-safety rails still have to be built, and the app already has a fast manual entry path.

**ANSWER:**

---

### Q-076 · Part B · Unlisted wants · Priority: MUST

**Context:** The current books hold: dashboard rebuild, backup, encryption, investment wallets, AI entry, and the page-split refactor. That list has not gained an item since July.

**Question:** What is **not** on the books that you want? Anything you have thought 'I wish it did X' while using it?

**Why it matters:** A roadmap assembled only from what was already planned tends to build the wrong things well. This is the one question in the file whose answer cannot come from the code.

**Options I see:**
  (Free text.)

**My recommendation:** None.

**ANSWER:**

---

### Q-077 · Part B · Cuts · Priority: MUST

**Context:** A scope list that only grows is not a plan. My candidates for cutting, in order of confidence: client-side encryption as planned (Q-072), the classic-statement third import source (Q-009), AI entry (Q-075), and time-boxed budgets / `budget_allocations` (Q-057, Q-085).

**Question:** What should be **cut**?

**Why it matters:** Cutting is the only operation that makes the remaining work finite, and every cut item also removes its maintenance debt from the docs — a plan file, a schema slot, a roadmap entry, and the questions they keep generating.

**Options I see:**
  (a) Cut encryption-as-planned and the third import source.
  (b) Cut all four candidates.
  (c) Cut something else, which I will name.
  (d) Cut nothing.

**My recommendation:** (a) at minimum. Both are large, both are speculative, and both currently distort decisions elsewhere — encryption pulls against Q-018 and Q-038, and `imported_statements` keeps appearing in schema discussions as though it were a live table.

**ANSWER:**

---

### Q-078 · Part B · Page split · Priority: SHOULD

**Context:** `docs/audit/STRUCTURE-REVIEW.md` and `PHASE-ROADMAP.md` Parked — splitting `Income.jsx`, `Import.jsx` and `WalletDetail.jsx`, gated behind component tests (Q-043) and the unmerged Budgeting branch (Q-015). §7 records the gating conditions specifically so the decision is not relitigated casually.

**Question:** Does the page split ever happen, or is it permanently parked?

**Why it matters:** It is the only 'internal quality' item on the roadmap and it competes directly with feature work. Parking it indefinitely is a legitimate answer that should be stated once rather than re-decided every session.

**Options I see:**
  (a) It happens once component tests exist.
  (b) Permanently parked — record the decision and stop raising it.
  (c) Partial only — extract the self-contained modals and sub-views (Q-049 (c)).

**My recommendation:** (b), unless you find yourself repeatedly struggling to change those files. The audit could not name a symptom, and a refactor without a symptom is risk without payoff.

**ANSWER:**

---

### Q-079 · Part B · Manual posting · Priority: SHOULD

**Context:** Nothing in the app posts automatically. Recurring income is logged by hand from `IncomeRecurringDetail`, recurring expenses are ticked off in `TransactionChecklist`, and there is no scheduler, cron job or edge function anywhere in the project (verified). It is why Unallocated plans use check-on-change rather than a background job, and why the import's recurring-link exclusion logic works at all.

**Question:** Is manual posting the permanent design, or would you want recurring items to post themselves?

**Why it matters:** It is the single biggest behavioural assumption in the app, and it is only documented in `PROJECT-CONTEXT.md` §5 — not in `CLAUDE.md`, which is where a reader meeting the word 'recurring' first lands. Automatic posting would need a scheduler the architecture has no place for, and it would make the capped-wallet mechanic fire unattended.

**Options I see:**
  (a) Manual forever — posting is the moment you confirm reality matches the plan.
  (b) Automatic, with a confirmation queue.
  (c) Fully automatic on the due date.

**My recommendation:** (a). It is what makes check-on-change sufficient, it keeps the import's recurring-link logic coherent, and (c) would move real money with no human present on paths that are currently non-atomic. If (a), it belongs in `CLAUDE.md` as a stated design principle.

**ANSWER:**

---

### Q-080 · Part B · Quality versus features · Priority: SHOULD

**Context:** Six of ten money paths are non-atomic, three files exceed 1,000 lines, lint has been red for months, and there are no component tests. None of that is visible to a user. Section A of this questionnaire contains roughly 25 actionable items.

**Question:** How should internal quality be weighed against features in the remaining roadmap — roughly what share of effort goes to the A-section items?

**Why it matters:** Without a rough proportion, internal work either happens all at once (stalling features) or never (accumulating until something breaks).

**Options I see:**
  (a) Fix the money-path atomicity, then features only.
  (b) Alternate — one internal item per feature.
  (c) Features first; internal work only when it blocks something.
  (d) Internal quality first until the A-list is empty.

**My recommendation:** (a). The atomicity work is the only internal item that can produce wrong money; almost everything else in section A is comfort, and comfort can wait.

**ANSWER:**

---


## B3. Feature behaviour

*11 questions — 3 MUST, 8 SHOULD, 0 NICE.*

### Q-081 · Part B · Backup contents · Priority: MUST

**Context:** `docs/plans/backup-restore-feature-plan.md` lists the export as wallets, transactions, recurring rules, income entries, income recurring, income templates, distribution rules, `budget_allocations` and settings. Since it was written the schema gained four `unallocated_*` tables, `unallocated_pending_conflicts`, and four import tables — and `budget_allocations` turned out to be empty and unused.

**Question:** What exactly goes in a backup — specifically, does it include imported transactions, counterparty learning, and the import bookkeeping tables?

**Why it matters:** It decides whether a restore reproduces your account or only its structure, and whether re-importing a statement after a restore double-counts everything.

**Options I see:**
  (a) Everything user-scoped, including import tables and `import_fingerprint` values — a restore is faithful.
  (b) Everything except the import bookkeeping (`imported_statements`, `monthly_balance_snapshots`, `recurring_import_links`) — cleaner, but a restored account re-asks every recurring question.
  (c) Core money data only (wallets, transactions, income, rules) — smallest and most portable.

**My recommendation:** (a). Fingerprints in particular must survive, or the first import after a restore re-imports every transaction you already have — which is the exact failure the dedupe layer exists to prevent.

**Conditional:** Only relevant if Q-071 is (a) or (b).

**ANSWER:**

---

### Q-082 · Part B · Restore semantics · Priority: SHOULD

**Context:** The backup plan proposes importing into a freshly re-registered account, remapping old wallet ids to newly created ones, and reconciling with the Unallocated wallet and settings row that `handle_new_user()` creates automatically. It says there should be 'a confirmation step on import if the account already has data, so a restore does not silently clobber existing data' — but never says what the confirmed behaviour actually is.

**Question:** What happens when you restore into an account that already has data?

**Why it matters:** Replace, refuse and merge are three very different features. Merge in particular is where restore features go to become bug reports, because ids have been remapped and duplicate detection across two histories is genuinely hard.

**Options I see:**
  (a) Replace — run the equivalent of a full reset first, then restore.
  (b) Refuse — restore only into an empty account.
  (c) Merge, with id remapping and duplicate detection.

**My recommendation:** (b) as the shipped behaviour, with (a) available behind the existing OTP-gated danger-zone confirmation. The two-tier reset already exists, so (a) is mostly wiring; (c) should not be attempted.

**Conditional:** Only relevant if Q-071 is (a) or (b).

**ANSWER:**

---

### Q-083 · Part B · Wallet deletion · Priority: MUST

**Context:** `src/pages/Wallets.jsx:53-58` — `handleDelete` refuses only for system wallets, then hard-deletes the row: `await supabase.from('wallets').delete().eq('id', wallet.id)`. **There is no balance check.** The confirmation copy at `:170-172` says the wallet 'and all its transactions will be permanently deleted', which is honest about the transactions but says nothing about the money: a wallet holding €300 can be deleted, and that €300 vanishes from the sum of balances with no transaction recording where it went. Other rows may also point at it — `income_distribution_rules.wallet_id`, `unallocated_plan_items`, and other wallets' `overflow_wallet_id`.

**Question:** What should happen when a wallet with a non-zero balance is deleted — and should it be possible at all?

**Why it matters:** This is the one behaviour the audit found that can destroy money with no record, and it is reachable from the Wallets page in two clicks. Every other money path in the app is careful; this one is not guarded at all.

**Options I see:**
  (a) Refuse to delete a wallet with a non-zero balance — require moving the money out first.
  (b) Require choosing a destination wallet, and move the balance as a recorded transfer before deleting.
  (c) Deactivate only (`is_active = false`), never delete, keeping history intact.
  (d) Leave it — I know what I am doing.

**My recommendation:** (b) if deletion must exist, (a) as the minimum viable guard today. Worth also checking what happens to an `overflow_wallet_id` pointing at the deleted wallet and to that wallet's `income_distribution_rules` rows — if those are not FK-cascaded, deletion leaves dangling references that will misroute a future capped overflow.

**ANSWER:**

---

### Q-084 · Part B · Overflow targets · Priority: SHOULD

**Context:** A capped wallet fills to `cap_max` at 100%, reduces the excess to `cap_reduction_rate`, and sends the overflow to `overflow_wallet_id` or, failing that, Unallocated (`distributeIncome.js:34`). The overflow target is deliberately restricted to non-capped wallets so it cannot itself be at max (§7). But nothing stops the target wallet from being deleted (Q-083), after which the overflow silently falls back to Unallocated.

**Question:** What should happen when a capped wallet's overflow target is deleted?

**Why it matters:** The restriction prevents the capped-to-capped case but not the deleted-target case, and the silent fallback means a plan changes without anyone being told.

**Options I see:**
  (a) Fine as is — the Unallocated fallback is always a correct destination.
  (b) Warn at wallet-delete time if the wallet is any other wallet's overflow target.
  (c) Block deleting a wallet that is an overflow target.

**My recommendation:** (b). Same family as Q-083 and almost certainly the same piece of work — one pre-delete check that looks at balance and inbound references together.

**ANSWER:**

---

### Q-085 · Part B · Time-boxed budgets · Priority: SHOULD

**Context:** A 'budget' in this app is a column on a wallet (`wallets.budget`), not an object with a date range. `budget_allocations` exists with `valid_from` and `valid_until` and 0 rows (Q-057), which suggests time-boxed budgets were designed once and abandoned. Every budget comparison in `dashboardCalcs` and `budgetPlan` reads the single number.

**Question:** Do you want budgets that change over time — a different grocery budget in December — or is one number per wallet correct?

**Why it matters:** It is the difference between keeping `budget_allocations` and dropping it, and it is a significant feature if wanted: it would touch the Budgeting page, the wallet cards, the dashboard's overspent and underfunded calculations, and the capped mechanic's `cap_max >= budget` CHECK.

**Options I see:**
  (a) One number per wallet is correct — drop the table.
  (b) I want per-month budgets.
  (c) I want a way to temporarily override a budget without changing the plan.

**My recommendation:** (a). The wallet model already handles 'more money this month' by letting the balance accumulate; a time-boxed budget adds a second, competing notion of the same idea and would need reconciling with `cap_max` everywhere.

**ANSWER:**

---

### Q-086 · Part B · Dashboard purpose · Priority: MUST

**Context:** `docs/dashboard-recon.md` §5 — the dashboard is currently 'a vertical list of six co-equal blocks' with no hero, no top-line summary, and the design spec's 'one hero number per screen' rule violated. The Wallets page has a `SummaryStrip`; the Dashboard does not. The recon names the 30-day projection as the strongest existing idea because it answers 'will I dip negative before payday'.

**Question:** What should the first screen tell you in one glance?

**Why it matters:** The questionnaire spec is right that this question drives the dashboard rebuild entirely — every other dashboard decision (what to cut, what to promote, what the hero number is) follows from it, and Q-070's scope depends on the answer.

**Options I see:**
  (a) Total balance and what is freely spendable right now.
  (b) Will I dip negative before payday — the 30-day projection.
  (c) What needs my attention (overdue, overspent, stalled plans).
  (d) How this month is going versus usual.

**My recommendation:** (b) as the hero, with (a) as a summary strip above it. The recon reached the same conclusion independently, and (c) is a better fit for a banner than a hero — attention items are episodic, and a hero that is usually empty is a wasted hero.

**ANSWER:**

---

### Q-087 · Part B · Freely spendable · Priority: SHOULD

**Context:** 'Freely spendable' is computable today but needs a definition decision (`docs/dashboard-recon.md` §2b). The candidate proposed there: the sum of `type='variable'` wallet balances plus the Unallocated balance, excluding fixed and investment as earmarked.

**Question:** Is that the right definition of freely spendable?

**Why it matters:** If a summary strip is added (Q-086), this number sits on it, and a wrong definition is worse than no number — it is the figure you would act on.

**Options I see:**
  (a) Variable plus Unallocated, as proposed.
  (b) Unallocated only — everything already in a wallet is assigned.
  (c) Variable plus Unallocated, minus the remaining budgeted commitments this month.

**My recommendation:** (a). (b) is arguably purer but would usually read as a small number sitting next to a large total, which confuses more than it clarifies; (c) is more accurate and much harder to explain on a card with an eleven-pixel label.

**Conditional:** Only relevant if Q-086 includes (a).

**ANSWER:**

---

### Q-088 · Part B · Plan stalls · Priority: SHOULD

**Context:** When more than one Unallocated plan is eligible at once, `evaluateUnallocatedPlans` (`src/lib/unallocatedPlans.js:72`) fires nothing, persists an `unallocated_pending_conflicts` row with a balance snapshot, and stalls until the user resolves it in `UnallocatedConflictBanner`. While a conflict is pending, **nothing auto-fires ever** — and if the eligible set is still ambiguous, the snapshot is simply refreshed.

**Question:** Is a permanent stall the right behaviour, or should a pending conflict expire or escalate?

**Why it matters:** A conflict left unresolved silently disables the entire automatic-distribution system indefinitely. The only signal is a banner on the dashboard and the Unallocated page.

**Options I see:**
  (a) Permanent stall is right — it is refusing to guess with money.
  (b) Stall, but escalate the surface after N days.
  (c) Stall only the conflicting plans; let non-conflicting plans keep firing.

**My recommendation:** (a). (c) sounds reasonable and quietly reintroduces exactly the guessing the design refuses — 'non-conflicting' is a judgement about which plans compete, which is the thing the code deliberately declines to make. If plan firings get a log (Q-003) and stalls get history (Q-058), the stall becomes visible enough without changing the behaviour.

**ANSWER:**

---

### Q-089 · Part B · Reconciliation · Priority: SHOULD

**Context:** Both import reconciliation checks are soft. `src/lib/import/reconcile.js:3-5`: 'BOTH CHECKS ARE SOFT. They warn; they never block the import and never drop a row… a real statement that trips a check is still the best record of what happened.' The chain check names the first row where the file and the parse disagree; the drift check compares a stored boundary balance against a newly derived one.

**Question:** Should any reconciliation failure ever block a commit?

**Why it matters:** A chain break means the parse disagrees with the bank's own running balance — which usually means a layout drift or a mis-parsed amount, i.e. the import is wrong rather than the statement.

**Options I see:**
  (a) Warn-only, permanently — lock the decision and stop revisiting it.
  (b) Warn by default, but block when the chain break exceeds a threshold.
  (c) Block on a chain break, warn on drift.

**My recommendation:** (a), per the decision log's reasoning — but only because the preview shows every parsed row before commit and nothing is auto-committed. If a 'commit without preview' path is ever added, this answer must change, and that dependency is worth recording alongside the decision.

**ANSWER:**

---

### Q-090 · Part B · Recurring exclusions · Priority: SHOULD

**Context:** A row matching a saved recurring link is excluded from the commit entirely; a first encounter always asks; an unanswered question blocks the import. The design is deliberately conservative because 'a wrong auto-exclude silently loses a real spend, which is worse than a missed match' (§7). But once links are saved, month two is silent by design.

**Question:** Should there be a way to review what a link excluded, after the fact?

**Why it matters:** The conservative design means the residual failure mode is silent omission, and there is currently no screen that says 'these four rows were skipped because of saved links'.

**Options I see:**
  (a) Yes — show excluded rows in the import result summary.
  (b) Yes — a persistent view of saved links and what each has matched.
  (c) No — the preview already shows them before commit.

**My recommendation:** (a). It is the cheap half of (b) and it closes the one silent-loss path in an otherwise very careful pipeline. (c) is true today but stops being true the moment links make month two silent, which is the whole point of links.

**ANSWER:**

---

### Q-091 · Part B · Templates · Priority: SHOULD

**Context:** Income templates carry a full distribution (name, amount, note, `send_remainder` flag, and items) and are created two ways that produce identical templates. Unallocated templates are a deliberately separate pool, judged against the live balance with affordable ones on top. §7 records that a standalone 'distribution-only template' was tried and dropped.

**Question:** Is the two-pool split still right, and is there anything you want templates to do that they do not?

**Why it matters:** Templates are the most-used convenience feature in the app by design, and this is one of the few places the docs record something being tried and abandoned — worth confirming that conclusion held up in use.

**Options I see:**
  (a) Still right, nothing missing.
  (b) Still right, but templates should do something specific which I will name.
  (c) Merge the pools.

**My recommendation:** (a). The pools have genuinely different shapes — one carries an amount, the other is judged against a live balance — and merging them would require inventing a common notion of 'amount' that neither wants.

**ANSWER:**

---


## B4. Visual direction and layout

*9 questions — 1 MUST, 5 SHOULD, 3 NICE.*

### Q-092 · Part B · Is the system final · Priority: MUST

**Context:** `DESIGN-SPEC.md` is described as locked, approved 2026-07-09 ('direction B structure × direction C warmth'), and enforced by the `design-check` skill. The audit confirmed near-total compliance: every token value in `src/index.css` matches the spec exactly, zero `font-bold`/`font-semibold` anywhere in `src/`, every euro rendered through `formatMoney()`, all charts inline SVG, with one four-class exception in `App.jsx` (Q-037).

**Question:** Is 'the blend' the final visual answer, or a stage you would move on from?

**Why it matters:** Everything else in B4 follows from this. It also decides whether the dashboard rebuild is a content exercise inside a fixed system, or an opportunity to change the system — which are very different amounts of work.

**Options I see:**
  (a) Final — the system is right; only content and layout change from here.
  (b) Mostly final, but I want to revisit something specific.
  (c) It was a stage — I would like to explore a different direction.

**My recommendation:** (a). The system is unusually well executed and the near-total compliance rate suggests it is not fighting you. If (c), that is a chat-first design phase in its own right and should be scheduled as one rather than folded into the dashboard rebuild.

**ANSWER:**

---

### Q-093 · Part B · Page-by-page verdict · Priority: SHOULD

**Context:** Nine screens exist: Dashboard, Wallets, WalletDetail, Income, IncomeRecurringDetail, Budgeting, Import, Settings, Login/ResetPassword. Only the Dashboard has a recon naming concrete problems. WalletDetail carries four behaviours in one page including an empty investment card. Import is the newest and has never been used on real data. Settings was rebuilt in the density pass to a 640px grouped layout.

**Question:** Page by page — is each layout final, does it need rework, or is it a placeholder?

**Why it matters:** It is the cheapest way to turn 'the app is fine' into a specific work list, and it stops the dashboard rebuild silently becoming an app-wide redesign.

**Options I see:**
  (Mark each of the nine: final / rework / placeholder.)

**My recommendation:** From the artefacts I would expect Dashboard = rework, WalletDetail = rework (the investment branch at minimum), and everything else = final. Correct me — you are the only one who has used them.

**ANSWER:**

---

### Q-094 · Part B · Likes and dislikes · Priority: SHOULD

**Context:** §7 records two aesthetic preferences directly: you disliked the colour picker, which is why wallet identity became the icon; and the mockup's per-wallet rainbow was dropped for one coral identity plus green metric bars, because colour was no longer user-editable.

**Question:** What do you actively like in the current UI, and what do you dislike?

**Why it matters:** Likes are as useful as dislikes and much harder to infer from code. A rebuild that removes something you liked is worse than no rebuild at all, and the two recorded preferences above are both dislikes — nothing in the repo records what you wanted kept.

**Options I see:**
  (Free text.)

**My recommendation:** None.

**ANSWER:**

---

### Q-095 · Part B · Reference apps · Priority: SHOULD

**Context:** The system is described as 'Monarch-style' in places and as 'direction B structure × direction C warmth' in `DESIGN-SPEC.md`. Monarch Money is the only external reference named anywhere in the repository.

**Question:** Are there apps whose look or information design you want to move toward?

**Why it matters:** One reference app resolves more layout questions than ten paragraphs of specification, particularly for the dashboard, where the open question is hierarchy rather than styling.

**Options I see:**
  (Free text.)

**My recommendation:** None — but if Monarch is still the reference, say so explicitly, because its dashboard is exactly the 'summary strip plus one hero' shape Q-086 recommends, and that would settle Q-086 and Q-070 together.

**ANSWER:**

---

### Q-096 · Part B · Density · Priority: SHOULD

**Context:** `DESIGN-SPEC.md` §8 locked six density rules in July: hero 22px plus metric bar plus caption plus a real footer line (no empty card bottoms); a summary strip under each page header; dense tables with `even:bg-field` zebra and 'Showing X of Y'; `CompactRow` for repeated items; a 640px grouped Settings layout; ghost dashed add-cards filling grid remainders. They are implemented once as shared primitives in `src/components/ui/`.

**Question:** Is the density right, too dense, or not dense enough?

**Why it matters:** Density is the hardest thing to change later because it is encoded in shared primitives used on every page. If it is wrong, that should surface before the dashboard rebuild reuses those primitives (which the recon explicitly requires it to).

**Options I see:**
  (a) Right.
  (b) Too dense — more breathing room.
  (c) Not dense enough — more per screen.

**My recommendation:** No recommendation — this is pure preference, and the spec already encodes a deliberate choice you made after seeing mockups.

**ANSWER:**

---

### Q-097 · Part B · Navigation · Priority: SHOULD

**Context:** Navigation is a fixed 224px sidebar (`src/components/Layout.jsx:35`) with five items — Dashboard, Wallets, Income, Import, Budgeting (`:6-12`) — plus Settings, a privacy toggle and sign-out. It does not collapse at any viewport width.

**Question:** Should navigation change — more items, grouping, or a collapse control?

**Why it matters:** Five items is comfortable and needs no grouping. The real constraint is the fixed width, which is also the blocker for any mobile work (Q-101), so this question and that one are the same piece of work.

**Options I see:**
  (a) No change.
  (b) Add a collapse toggle.
  (c) Restructure — I will say how.

**My recommendation:** (b), but only if Q-101 says mobile matters. On desktop alone, five items in a fixed rail is the right answer and a collapse control is a button nobody presses.

**Conditional:** Answer after Q-101.

**ANSWER:**

---

### Q-098 · Part B · Dark mode · Priority: NICE

**Context:** Dark mode works by `.dark` overriding the same CSS variables, so almost no component contains a `dark:` utility at all (`docs/audit/UNDERSTANDING.md` §5). It is applied from `settings.theme` and re-fetched on every auth state change (`App.jsx:64`). Every UI verification in this project is a both-theme sweep.

**Question:** Do you actually use dark mode, and should it follow the OS rather than a stored preference?

**Why it matters:** It doubles the verification cost of every UI change. If it is never used, that is worth knowing; if it is used, following the OS is a small addition that removes a setting.

**Options I see:**
  (a) I use it; the stored preference is right.
  (b) I use it; it should follow the OS.
  (c) I never use it.

**My recommendation:** (a) or (b). Do not drop it even if (c) — the token architecture makes it nearly free to maintain, and the cost is in verification habits rather than code.

**ANSWER:**

---

### Q-099 · Part B · Money presentation · Priority: NICE

**Context:** `formatMoney()` produces `€ 1.234,56` with a normal space after the euro sign and U+2212 for negatives, hand-rolled for deterministic output and covered by 15 tests. `formatMoneyCompact()` produces `€500` / `€1.5k` for charts. `DESIGN-SPEC.md` §3 already permits de-emphasising decimals on hero numbers.

**Question:** Is the money presentation right — the space after `€`, the compact `k` form, two decimals everywhere?

**Why it matters:** It appears on literally every screen and is the one formatting decision that is expensive to revisit once charts, tables, tests and the design spec all encode it.

**Options I see:**
  (a) Right as is.
  (b) Drop or de-emphasise decimals on large and summary numbers.
  (c) Something else, which I will name.

**My recommendation:** (a), with (b) worth considering for the dashboard hero specifically — the spec already allows it, and a 36px number with cents reads as more precision than the projection actually has.

**ANSWER:**

---

### Q-100 · Part B · Empty and sparse states · Priority: NICE

**Context:** Empty states are specified as 'no card, centred both axes on the page bg, `ink-muted` headline plus `ink-faint` support line', with a boxed empty-state card called a violation (`DESIGN-SPEC.md` §7). The dashboard's is the bare string 'Nothing here yet'. The 'Over time' charts have no low-data state at all and render mostly empty with under a year of history (`docs/dashboard-recon.md` §4-5).

**Question:** How much do empty and sparse states matter?

**Why it matters:** On a personal tool with a populated account, almost never — except that the test account is thin (Q-030), so every screenshot you or an agent takes shows them, and they are what any future reviewer would see first.

**Options I see:**
  (a) Low priority — I will never see them again.
  (b) Worth doing properly as part of the dashboard rebuild.
  (c) Worth doing now.

**My recommendation:** (b), scoped to the sparse-data case specifically. That is the one that looks broken rather than empty — an axis with one bar reads as a bug, while 'Nothing here yet' reads as intentional.

**ANSWER:**

---


## B5. Platform and reach

*6 questions — 1 MUST, 4 SHOULD, 1 NICE.*

### Q-101 · Part B · Mobile · Priority: MUST

**Context:** The app shell is `flex h-screen overflow-hidden` with a fixed `w-56 shrink-0` sidebar and no hamburger or collapse anywhere (`src/components/Layout.jsx:33-35`). At 390px the sidebar still consumes 224px, leaving content in roughly a 150px strip. `docs/dashboard-recon.md` §3 calls this out directly: 'any mobile-aware redesign must address this at the shell level, not just the dashboard.'

**Question:** Is a mobile or responsive experience wanted, and at what priority?

**Why it matters:** This is a personal-finance app, which is fundamentally a phone use case — check a balance, log a spend, tick off a payment. If mobile matters at all, it is a shell-level change that must come **before** the dashboard rebuild, not after, because every layout decision in that rebuild depends on it. Rebuilding the dashboard first and then making it responsive means designing it twice.

**Options I see:**
  (a) Desktop only, permanently — I only use this at a computer.
  (b) Responsive, and it is a priority — do the shell before the dashboard.
  (c) Responsive eventually, after the dashboard.
  (d) A dedicated mobile view or PWA.

**My recommendation:** (b) if you would ever log a spend from your phone. The order matters more than the effort here. If (a), skip Q-102 and Q-103, and Q-097 becomes (a).

**ANSWER:**

---

### Q-102 · Part B · Load performance · Priority: SHOULD

**Context:** The main JS chunk is 732 kB (190 kB gzipped) and the pdf.js worker 1.26 MB; only the `Import` route is code-split (`src/App.jsx:102`). Build emits one warning about chunks over 500 kB.

**Question:** If mobile matters, does first-load performance on mobile data matter enough to code-split further?

**Why it matters:** 190 kB gzipped before first paint is unremarkable on wifi and noticeable on a slow connection. But this is a returning-user app on a known device, so caching covers most of it.

**Options I see:**
  (a) Yes — split the heavier routes.
  (b) No — caching covers a returning-user app.
  (c) Only if it actually feels slow in use.

**My recommendation:** (c). Measure before splitting; the same person on the same device loads this repeatedly, which is the best case for caching.

**Conditional:** Skip if Q-101 is (a).

**ANSWER:**

---

### Q-103 · Part B · Mobile scope · Priority: SHOULD

**Context:** Some flows are phone-shaped and some are not. Realistically phone-shaped: logging a variable spend, ticking off a recurring payment, checking balances, and the privacy toggle. Not phone-shaped: the Budgeting flow diagram, the Import preview table, and `DistributionPopup`'s dual side-by-side progress bars with per-row euro/percent toggles.

**Question:** If mobile matters, which flows must work on a phone — and which may stay desktop-only?

**Why it matters:** It turns 'make it responsive' into a bounded piece of work rather than an app-wide rewrite, and it gives the shell change a clear acceptance test.

**Options I see:**
  (a) Endorse the split above — the four phone flows work, Import and Budgeting say 'open this on a bigger screen'.
  (b) Everything must work on a phone.
  (c) A different split, which I will describe.

**My recommendation:** (a). Import and Budgeting can legitimately show a 'use a larger screen' message; forcing a 42-row preview table onto 390px produces something nobody would use anyway.

**Conditional:** Skip if Q-101 is (a).

**ANSWER:**

---

### Q-104 · Part B · Offline · Priority: SHOULD

**Context:** The app is a pure SPA against Supabase with no service worker, no caching layer and no offline handling. Every page fetches on mount, and every write assumes a live RPC round trip.

**Question:** Does offline behaviour matter at all?

**Why it matters:** For a phone use case, 'log a spend while offline' is the obvious want — and it is the one feature that would fundamentally change the write architecture, because a queue-and-sync layer sits on top of a money model whose writes are currently non-atomic.

**Options I see:**
  (a) No — online only.
  (b) Read-only offline — see balances from a cache.
  (c) Offline writes with sync.

**My recommendation:** (a). (c) is comfortably the most expensive thing anyone could add to this project: it means reconciling queued balance changes against a database that may have moved, on paths that do not yet have transactions.

**ANSWER:**

---

### Q-105 · Part B · Custom domain · Priority: NICE

**Context:** Deployed on Vercel from `main` with an SPA rewrite in `vercel.json`. No custom domain appears anywhere in the repo or config.

**Question:** Is a custom domain wanted?

**Why it matters:** Purely cosmetic unless Q-065 is (b) or (c), in which case a `*.vercel.app` URL is friction for anyone you share it with — and a bookmarked deployment URL is fragile.

**Options I see:**
  (a) No.
  (b) Yes.
  (c) Only if other people use it.

**My recommendation:** (c).

**ANSWER:**

---

### Q-106 · Part B · Free tier · Priority: SHOULD

**Context:** `PROJECT-CONTEXT.md` §8 puts the Supabase free-tier ceiling at roughly 200–250 active users, egress-bound. Email verification runs through Resend. Vercel hosting is free at this scale.

**Question:** Is staying on the free tier a constraint you want honoured in design decisions?

**Why it matters:** It interacts with Q-062 and Q-065. If the answer is 'free tier forever', fetch-everything is fine permanently and there is no reason to build for scale anywhere — which removes a whole class of premature decisions from every future phase.

**Options I see:**
  (a) Yes — free tier is a hard constraint.
  (b) No — I would pay if needed.
  (c) Free tier, but I want to know before I cross a limit.

**My recommendation:** (a) for a personal tool. Designing explicitly for one user and stopping all thought about scale is a genuine simplification, not a compromise.

**ANSWER:**

---


## B6. Data, privacy and trust

*7 questions — 2 MUST, 3 SHOULD, 2 NICE.*

### Q-107 · Part B · Encryption conviction · Priority: MUST

**Context:** The encryption plan accepts two costs in its own words: loss of database-side atomicity on balance updates ('a real downgrade from a provable guarantee to a probabilistic one') and no database-side computation, filtering or sorting on encrypted fields. §7 records the stance as 'desirable to the owner (cares about data privacy) but accepted as a large, later project' — written before the app had six non-atomic money paths and four atomic RPCs holding its guarantees.

**Question:** How strongly do you actually feel about the encryption ambition, given that cost?

**Why it matters:** This single answer determines whether the money layer moves toward the database or away from it, and therefore what Q-018, Q-038, Q-045 and Q-046 should be. The trade-off has changed since the stance was recorded.

**Options I see:**
  (a) Strongly — it is the point, accept the cost.
  (b) It matters, but not at that price.
  (c) It was aspirational rather than a commitment.

**My recommendation:** Answer honestly rather than aspirationally — an aspirational yes here freezes several other decisions indefinitely. My read is (b), because you are the admin you would be hiding data from (Q-108). If (b) or (c), Q-072 should be (b), (c) or (d).

**Conditional:** Skip if Q-072 is (c) or (d).

**ANSWER:**

---

### Q-108 · Part B · Admin visibility · Priority: SHOULD

**Context:** `PROJECT-CONTEXT.md` §5 — 'Admin visibility is intentional: the Supabase dashboard / service role bypasses RLS and can see all data. Protection is between users, not from the owner.' The mitigation recorded is to keep the Supabase account well-secured with 2FA.

**Question:** Is admin-visible data acceptable indefinitely?

**Why it matters:** It is only a problem if other people use the app (Q-065). For a single user, the admin and the user are the same person, and encryption would protect against nothing except a Supabase-side breach.

**Options I see:**
  (a) Yes, acceptable — I am the only user.
  (b) Acceptable now, not if others use it.
  (c) Not acceptable — this is exactly why encryption matters.

**My recommendation:** (a) or (b). If (b), note that the trigger is other people joining — which makes encryption a prerequisite of growth rather than a phase in its own right, and therefore something to schedule against Q-065 rather than against the calendar.

**ANSWER:**

---

### Q-109 · Part B · What is sensitive · Priority: SHOULD

**Context:** What this database actually holds: wallet names, transaction notes and counterparty names taken from real bank statements, amounts, balances, and an `account_iban` on `monthly_balance_snapshots`.

**Question:** Which of those do you consider genuinely sensitive?

**Why it matters:** It scopes any partial-encryption option (Q-072 (b)) and tells us whether the sensitivity lives in the *amounts* or in the *narrative* — who you paid and for what. The two have very different costs to encrypt, because only one of them is summed, sorted and compared by the database.

**Options I see:**
  (a) Amounts and balances.
  (b) The narrative — notes, counterparty names, wallet names.
  (c) Both equally.
  (d) The IBAN specifically.

**My recommendation:** If (b), partial encryption becomes genuinely attractive: names and notes are never aggregated or filtered by the database, so encrypting them costs nothing architecturally and the balance RPCs survive untouched. That is the version of this feature actually worth building.

**Conditional:** Skip if Q-072 is (c) or (d).

**ANSWER:**

---

### Q-110 · Part B · Backup guarantee · Priority: MUST

**Context:** There is no export today. Free-tier Supabase backup guarantees are limited, and the app's own two-tier reset can wipe an account from the Settings danger zone behind an OTP confirmation.

**Question:** What must the backup story guarantee — and is your data backed up in any form right now?

**Why it matters:** It sets the bar for Q-071 and Q-081. 'I could rebuild it from my bank statements' is a legitimate answer that lowers the priority considerably; 'I would lose months of categorisation' raises it sharply.

**Options I see:**
  (a) Nothing — I could rebuild it.
  (b) I want a file I control, on demand.
  (c) I want automatic periodic backups I do not have to remember.

**My recommendation:** (b). (c) is meaningfully harder — where do they go, who stores them, what reminds you — and the plan's 'gentle periodic reminder to export' is the pragmatic middle ground between the two.

**ANSWER:**

---

### Q-111 · Part B · Account deletion · Priority: SHOULD

**Context:** Account deletion was explicitly out of scope for settings phase 1 because it needs an edge function (`PROJECT-CONTEXT.md` §6.3). 'Full reset' removes a user's data but leaves their auth account in place.

**Question:** Does account deletion need to exist?

**Why it matters:** If other people ever use the app (Q-065), it is table stakes and arguably a legal expectation. If not, it is dead weight and an edge function to maintain.

**Options I see:**
  (a) No — not needed.
  (b) Yes, if others use it.
  (c) Yes regardless.

**My recommendation:** (b). Tie it to Q-065 rather than building it speculatively — an edge function is the only server-side code this project would have, and that is a real maintenance surface to add for nobody.

**ANSWER:**

---

### Q-112 · Part B · Open signup · Priority: NICE

**Context:** Signup is open with email verification via Resend, and the success message is deliberately worded to avoid confirming whether an email is already registered (an anti-enumeration choice recorded in §5). There is no admin UI to see or remove users.

**Question:** Should signup stay open?

**Why it matters:** An open signup on a free tier with a user ceiling is an invitation for a stranger to consume your quota, and it is the only unauthenticated write path in the app.

**Options I see:**
  (a) Close it — invite or allowlist only.
  (b) Leave it open.
  (c) Leave it open but cap it.

**My recommendation:** (a) if Q-065 is (a). Nothing is gained by open signup on a personal tool, and the anti-enumeration wording that had to be designed around it stops being necessary.

**ANSWER:**

---

### Q-113 · Part B · Test/real separation · Priority: NICE

**Context:** The test account's credentials live in `.env.test.local` (gitignored via `*.local`), and `CLAUDE.md` requires browser automation to use it rather than the owner's real account, with `db-verifier` checks scoped to that account's `user_id`. Both accounts live in the **same** Supabase project and database.

**Question:** Is the current separation between test and real data sufficient, or do you want a separate project for testing?

**Why it matters:** A destructive mistake scoped to the wrong `user_id` is one query away, and the `reset_user_data` RPC exists precisely to be called. RLS protects users from each other, not an agent holding the owner's session from the owner's own data.

**Options I see:**
  (a) Sufficient — RLS and the discipline are enough.
  (b) A separate Supabase project for testing.
  (c) Sufficient, but no agent may ever call `reset_user_data`.

**My recommendation:** (c) as an immediate rule — it costs nothing and closes the one genuinely irreversible call. (b) becomes cheap only if Q-060 produces a baseline migration; without one, a second project cannot be created from the repo at all.

**ANSWER:**

---


## B7. Collaboration

*3 questions — 1 MUST, 1 SHOULD, 1 NICE.*

### Q-114 · Part B · Second developer · Priority: MUST

**Context:** `CLAUDE.md` was rewritten single-maintainer on 2026-09-14 (audit block D-16, option b). `origin/WOUTER` is 67 commits behind `main` and 0 ahead, last commit 2026-06-24; `woholvoe` has 6 of 86 commits on `main`, none since June; **no `f/` branch has ever existed**. `OPEN-QUESTIONS.md` Q2 keeps the question open in case that changes.

**Question:** Is the second developer coming back, and does anything in the roadmap depend on them?

**Why it matters:** The decision was already taken in the docs, but the register still carries it. The answer determines whether the branch convention, the collaborator setup section and `origin/WOUTER` should be restored, kept, or removed — and whether the PR discipline in Q-115 is a review mechanism or a solo checklist.

**Options I see:**
  (a) No — single maintainer permanently. Delete `origin/WOUTER` and close Q2.
  (b) Possibly — keep the question open.
  (c) Yes, and I will say what they own.

**My recommendation:** (a) unless you know otherwise. Two of the three artefacts describing the collaboration are already stale, and a stale branch on the remote is the kind of thing someone eventually tries to merge.

**ANSWER:**

---

### Q-115 · Part B · PR discipline · Priority: SHOULD

**Context:** Branch-plus-PR discipline is enforced by habit plus a PreToolUse Bash guard, because branch protection is unavailable on the free plan. All 18 of the project's PRs were opened and merged by the same person.

**Question:** With one maintainer, does the PR discipline still earn its overhead?

**Why it matters:** A PR you open and merge yourself is a checklist rather than a review. The value it genuinely provides here is real but specific: CI runs on it, and it produces the diff the `code-reviewer` agent reads. Worth stating that explicitly rather than assuming the habit is self-justifying.

**Options I see:**
  (a) Keep it — the CI gate and the reviewable diff are the point.
  (b) Keep it, but allow small doc-only changes direct to `main`.
  (c) Drop it.

**My recommendation:** (a). The guard hook already blocks the alternative, and every incident recorded in §8 involves a merge. (b) sounds harmless and is how 'just this once' starts.

**ANSWER:**

---

### Q-116 · Part B · Audit artefacts · Priority: NICE

**Context:** `docs/audit/` holds the six-session artefacts permanently after this operation ends — about 4,300 lines across ten markdown files plus three HTML interfaces. `PROJECT-CONTEXT.md` §9 lists it under 'living reference'.

**Question:** After this questionnaire is answered, what happens to `docs/audit/` — living reference, partial archive, or archive it all?

**Why it matters:** Its value drops sharply once its findings are folded into `PROJECT-CONTEXT.md`, `OPEN-QUESTIONS.md` and the roadmap — and a stale audit is exactly the kind of document this whole operation existed to eliminate.

**Options I see:**
  (a) Keep as-is — it is the reasoning behind the current structure.
  (b) Keep `UNDERSTANDING.md` and this questionnaire; archive the rest.
  (c) Archive all of it once the answers are folded in.

**My recommendation:** (b). `UNDERSTANDING.md` is the only artefact that would take a fresh reader a full session to reproduce; `INVENTORY.md` in particular starts going stale the moment anyone commits.

**ANSWER:**

---


## B8. Working style and autonomy

*7 questions — 2 MUST, 4 SHOULD, 1 NICE.*

### Q-117 · Part B · Review boundary · Priority: MUST

**Context:** This operation ran six sessions with a human approval gate on every consequential change, via decision files with explicit `ok` / `no` / `defer` markings; three sessions were read-only by construction. The guard hook blocks six specific destructive commands deterministically. The A-list that follows ranges from 'fix four Tailwind classes' (Q-037) to 'rewrite the money layer as RPCs' (Q-018).

**Question:** Which categories of the remaining work do you want to review before they land, and which can run unsupervised?

**Why it matters:** Treating everything identically means either over-reviewing trivia or under-reviewing money. A rule that maps onto the directory structure is enforceable; a rule that maps onto judgement is not.

**Options I see:**
  (a) Review everything, as now.
  (b) Unsupervised for docs, tests, styling and lint; reviewed for anything touching `src/lib/` money modules, schema, or RPCs.
  (c) Unsupervised for anything with test coverage; reviewed for anything without.
  (d) Something else, which I will describe.

**My recommendation:** (b), with (c)'s test-coverage rule as a secondary filter. It maps cleanly onto directories, which makes it something a hook or a `CLAUDE.md` rule can actually express.

**ANSWER:**

---

### Q-118 · Part B · Schema gate · Priority: MUST

**Context:** `CLAUDE.md` rule 3 and the `db-migration` skill gate schema changes: Claude Code drafts SQL, the owner applies it, verification afterwards is read-only. The audit's live-DB pass respected this — SELECT only, no writes. The rule exists because the original multi-user migration was *assumed* applied and silently never ran, breaking isolation and account deletion until it was run by hand (§8).

**Question:** Does that gate stay exactly as it is?

**Why it matters:** Several recommendations in this file need migrations — Q-011, Q-018, Q-024, Q-032, Q-057, Q-060. If the gate stays, each is a two-step with a human in the middle, which shapes how they should be batched into as few owner interventions as possible.

**Options I see:**
  (a) Unchanged — draft, owner applies, verify after.
  (b) Allow autonomous application against a Supabase *branch*, never production.
  (c) Relax for additive changes only (new column, new index), never for drops or function replacement.

**My recommendation:** (a), and possibly (b) once Q-060 gives the repo a baseline migration. The rule is scar tissue from a real incident, and nothing in the remaining work is urgent enough to justify removing it.

**ANSWER:**

---

### Q-119 · Part B · Guard coverage · Priority: SHOULD

**Context:** The PreToolUse Bash guard (`.claude/scripts/guard-bash.cjs`) deterministically blocks force-push, push to `main`, recursive force-delete, `npm audit fix --force`, destructive SQL, and hard reset/clean. It is a substring guard, so a command that merely mentions a blocked pattern is also blocked — test payloads must go via a file.

**Question:** Is anything missing from that list, given the work that remains?

**Why it matters:** The remaining work includes migrations, a possible schema dump, dependency bumps and a seed script. My candidates: `supabase db reset`, any `DROP` outside a reviewed migration file, `git push --delete`, and installing a new dependency without asking.

**Options I see:**
  (a) Add all four.
  (b) Add only the Supabase ones.
  (c) The list is fine as it is.

**My recommendation:** (a) minus the dependency one, which works better as a stated `CLAUDE.md` rule than a hard block — a blocked `npm install` is confusing mid-task, whereas a stated rule is simply followed.

**ANSWER:**

---

### Q-120 · Part B · Test-account writes · Priority: SHOULD

**Context:** Browser testing always logs in with the test account from `.env.test.local`, never the owner's real account, and `db-verifier` checks are scoped to that account's `user_id` (`CLAUDE.md`). Q-030 recommends a seed script, which is a write.

**Question:** What may an agent do to the test account unattended — and may it seed data?

**Why it matters:** Without an explicit answer, the seed script either never gets written or gets run without permission. Both outcomes are worse than deciding now.

**Options I see:**
  (a) Full freedom on the test account, including seeding and resets.
  (b) May seed and read; may not call `reset_user_data`.
  (c) Read-only — every write asked for first.

**My recommendation:** (a) for the test account specifically, provided `.env.test.local` is the only credential source used and nothing ever touches the owner's `user_id`. The point of a test account is that it is expendable; (c) makes Q-030 impossible in practice.

**ANSWER:**

---

### Q-121 · Part B · Gates and skills · Priority: SHOULD

**Context:** The project has two custom subagents (`code-reviewer`, `db-verifier`) and four skills (`db-migration`, `design-check`, `verify-merge`, `wrapup`). `CLAUDE.md` mandates `code-reviewer` before declaring a feature done, `verify-merge` after any merge, and `wrapup` at the end of every session. This audit exercised all of them repeatedly.

**Question:** Are those gates working, and is any of them ceremony you would drop?

**Why it matters:** `wrapup` in particular is the habit the entire status model now depends on — §6 is the single source of status precisely because `wrapup` already updates it. If that habit lapses, the structure the audit just built decays within weeks.

**Options I see:**
  (a) All working — keep them.
  (b) Drop one specifically.
  (c) Add a gate, which I will name.

**My recommendation:** (a). The one I would reinforce rather than add is `verify-merge` — it is already mandated and it is the easiest to skip precisely when a merge 'looked clean', which is when it has historically mattered most.

**ANSWER:**

---

### Q-122 · Part B · Decision files · Priority: SHOULD

**Context:** This operation used numbered decision blocks plus a self-contained offline HTML review interface with a JSON export loop. Four such files were produced (cleanup, structure, docs, and this questionnaire), and every previous one came back fully decided.

**Question:** Is that the right mechanism for future work, or was it overhead justified only by the audit's size?

**Why it matters:** It is a real cost to produce, and it is only worth repeating if the format made the decisions easier rather than merely prettier. You are the only person who can say which.

**Options I see:**
  (a) Yes — use it for any multi-item decision.
  (b) Only for things with more than roughly fifteen items.
  (c) Plain markdown decision blocks are enough.
  (d) Neither — decide in conversation.

**My recommendation:** (b). Below about fifteen items a conversation is faster than building an interface, and the interface's real value showed up at 21 and 22 items, not at 1 (the structure review's single block would have been quicker as a sentence).

**ANSWER:**

---

### Q-123 · Part B · Plan mode · Priority: NICE

**Context:** `CLAUDE.md` mandates plan mode first for any feature or refactor, with the plan approved before code is written.

**Question:** Does that still hold for small changes, and where is the line?

**Why it matters:** Several A-list items are five to twenty line fixes (Q-037, Q-016, Q-029). Plan mode on a four-class Tailwind fix is friction with no benefit, and friction with no benefit is how good rules get quietly abandoned.

**Options I see:**
  (a) Plan mode for anything touching `src/lib/`, pages, or schema; direct for docs, styling and config.
  (b) Plan mode always, as now.
  (c) Plan mode for anything over N files.

**My recommendation:** (a). It is the same directory-based line as Q-117, which makes both rules easy to remember and easy to state in one sentence of `CLAUDE.md`.

**ANSWER:**

---


## B9. Constraints

*4 questions — 1 MUST, 3 SHOULD, 0 NICE.*

### Q-124 · Part B · Time · Priority: MUST

**Context:** `main` received no commits between 2026-07-30 and the start of this audit — five weeks — while the most recent feature work sat on an unpushed local branch. The project has been running since December 2025 and has 86 commits and 18 merged PRs.

**Question:** How much time do you realistically have for this, per week?

**Why it matters:** It is the difference between 'encryption is a phase' and 'encryption is a year'. Every priority recommendation in this file implicitly assumes a rate; without one, the *order* of the roadmap matters far more than its contents.

**Options I see:**
  (a) A few hours a month.
  (b) A few hours a week.
  (c) Substantial blocks when I have them, nothing in between.

**My recommendation:** No recommendation — but if (a) or (c), cut hard in Q-077. A long list at a low rate is exactly how a project stalls, and this one has already had one five-week gap.

**ANSWER:**

---

### Q-125 · Part B · Budget · Priority: SHOULD

**Context:** Current costs: Supabase free tier, Vercel, Resend for verification email, and Claude usage. §6.3 notes a $20 Claude API credit was once available for the AI-entry idea.

**Question:** Is there a budget, and does anything on the roadmap depend on spending money?

**Why it matters:** Two answers above touch it — the Supabase tier (Q-106) and error reporting (Q-056 (b)). Both are free at this scale, so the honest answer may simply be 'nothing depends on it'.

**Options I see:**
  (a) Zero budget — everything must stay free.
  (b) A small budget is available.
  (c) Not a constraint.

**My recommendation:** (a) is entirely achievable for everything recommended in this questionnaire. Nothing I recommend requires a paid service.

**ANSWER:**

---

### Q-126 · Part B · Deadlines · Priority: SHOULD

**Context:** Nothing in the repo suggests an external deadline. The only genuinely time-sensitive item the audit found is Q-011: the fingerprint index decision is cheapest before the first real import (Q-010), not after.

**Question:** Is there a deadline or an external event that constrains sequencing?

**Why it matters:** If there is no deadline, sequencing should follow risk — money paths first. If there is one, it should follow the deadline, and several recommendations would reorder.

**Options I see:**
  (a) No deadline.
  (b) Yes — I will name it.

**My recommendation:** None.

**ANSWER:**

---

### Q-127 · Part B · What happens next · Priority: SHOULD

**Context:** The remaining work splits fairly cleanly into decisions that need a conversation (dashboard content, encryption scope, visual direction) and execution that does not (the atomicity RPCs, tests, the small fixes). `PHASE-ROADMAP.md` already encodes this split as CHAT-FIRST versus CODE-FIRST.

**Question:** Does that split still match how you want to work, and which remaining items do you want to talk through before anything is built?

**Why it matters:** It decides what happens immediately after this questionnaire is answered — a build session, or a design conversation.

**Options I see:**
  (a) The split is right; the chat-first items are dashboard content and encryption scope.
  (b) I want to talk through more than that.
  (c) Skip the conversations — just plan and build.

**My recommendation:** (a). Of everything remaining, only the dashboard's content (Q-086) and the encryption scope (Q-072) genuinely need a conversation; the rest is decided by the answers in this file.

**ANSWER:**

---


# Closing

## Questions I could not formulate

Areas where I sensed something unresolved but could not turn it into a clean question with
options. Recorded because the murk itself is information.

- **Whether the wallet model itself is still right.** I understood the mechanics exhaustively, but I could not tell from the code whether the envelope abstraction still matches how you think about money — or whether some of its friction (must-fund pinning, the capped asymmetry, Unallocated as a drain) is you working around the model rather than with it. There is no alternative nameable from the code, so there is no question with options to ask.

- **Why Budgeting Phase C was never pushed.** The branch is complete and tested. Nothing in the repository explains the stop, and the reason matters more than the branch does — lost interest in the feature, a doubt about its design, and simply life each imply a different answer to Q-015. I could not ask it without guessing at you.

- **What Phase C actually does.** I have its diffstat (`budgetPerformance.js`, 213 lines, 268 lines of tests, four components) but not its content — it is unmerged work outside the audit's read set. So every Phase C question here is about the branch's existence, not its design. If you want it reviewed on its merits, that is a separate session.

- **Whether the import subsystem is over-built for the actual need.** Fifteen modules and roughly 200 of 352 tests serve a pipeline that has never processed a real file. It may be exactly right and about to prove it; it may be the most elaborate part of the app serving the smallest real need. I could not tell from reading, which is why Q-010 tries to make the question answerable by running it rather than discussing it.

- **Anything wrong that you have noticed and never written down.** Q-067 and Q-094 are my attempts to reach it, but a question cannot retrieve a complaint that was never articulated. If something about this app irritates you and is not in this file, that is the most valuable thing you could add to it.

## Assumptions I am currently making

These are what I would proceed on if nobody answered anything. They are the highest-risk items
in this whole document, because they are where silent drift starts — each one is a decision
being made by default rather than on purpose.

1. **This is a personal tool for one person, permanently.** Every recommendation in this file is sized to that. If Q-065 is (c), roughly a third of it should be re-read.
2. **Desktop only.** If mobile matters, the ordering of the dashboard work in this file is wrong, not just incomplete.
3. **Encryption will not happen in its full planned form**, so the money layer should move *further into* the database (atomic RPCs), not out of it. This is the single most consequential assumption here, and the one I would most want contradicted early rather than late — reversing it after the RPC work would waste the RPC work.
4. **The design system is final** and only content and layout change from here.
5. **Manual posting of recurring items is permanent**, so no scheduler will ever exist and check-on-change remains sufficient.
6. **The free tier is a permanent constraint** and the app will never be optimised for scale. Fetch-everything with client-side aggregation stays.
7. **Budgeting Phase C gets landed rather than abandoned**, so the page-split refactor stays gated behind it and behind component tests.
8. **`budget_allocations` and `imported_statements` are dead** and nothing will be built on them.
9. **The `db-migration` gate stays**: no agent applies a write migration, ever.
10. **Nothing in `Cursus/` will be updated again**, and its schema content stays wrong.
11. **Status stays in `PROJECT-CONTEXT.md` §6 and open decisions in `OPEN-QUESTIONS.md`**, maintained by the `wrapup` habit. If that habit lapses, the structure the audit just built decays within a few weeks.

## If I could only ask five questions

The honesty check on everything above.

1. **Q-065** — Is this a personal tool, or a product other people will use? Everything else is sized by this.
2. **Q-067** — What is missing that actually bothers you when you use it? The only thing in this file I could not derive from the code.
3. **Q-072** — Is client-side encryption real, and at what scope? It decides whether the money layer moves toward the database or away from it — and the two directions cancel each other out.
4. **Q-101** — Does mobile matter? If yes, the shell change comes first and the dashboard plan changes shape.
5. **Q-077** — What gets cut? Nothing else on this list makes the remaining work smaller.

---

*Answered? Record the resulting decisions in `PROJECT-CONTEXT.md` §7, move anything still open
into `OPEN-QUESTIONS.md`, and rewrite `PHASE-ROADMAP.md` to whatever survives Q-077. Status
stays in `PROJECT-CONTEXT.md` §6 and nowhere else.*

# QUESTIONNAIRE-SPEC.md — what `QUESTIONNAIRE.md` must contain

> Commit to `docs/audit/QUESTIONNAIRE-SPEC.md`. Read by Session 6 of the audit operation.

---

## Purpose

The questionnaire exists to eliminate ambiguity before any further building happens. It has two
halves that are equally important:

- **Part A — where we are.** Everything about the existing codebase that is unclear, undecided,
  half-finished, inconsistent, or that you would do differently. These questions come *from* the
  code; you generate them by having read it.
- **Part B — where we are going.** The owner's intent for the finished application: remaining
  scope, feature behaviour, visual direction, and what "done" means. These questions come *to*
  the owner; the section list below is fixed, and you personalise each question with what the
  code actually shows.

The output of the completed questionnaire feeds a roadmap and a model-routing decision (which
remaining work goes to which model). Questions that would not change either of those are noise.

---

## Format

One block per question, in this exact shape:

```
### Q-047 · Part A · Imports · Priority: MUST
**Context:** `src/lib/import/reconcile.js:88` treats a failed balance-chain check as a warning
  and still allows the commit. `PROJECT-CONTEXT.md` §7 says the checks are deliberately soft.
**Question:** Should any reconciliation failure ever block a commit, or is warn-only final?
**Why it matters:** Determines whether the import path needs a hard-fail branch before the
  backup phase, and whether the soft-check decision should be promoted to a locked rule.
**Options I see:**
  a) Warn-only, permanently. Lock the decision and stop revisiting it.
  b) Warn by default, but block when the chain break exceeds a threshold.
  c) Block on chain break, warn on drift.
**My recommendation:** (a) — the decision log's reasoning still holds and nothing has changed.
**ANSWER:**
```

Rules:

- **`Priority:`** is one of `MUST` (a roadmap cannot be built without this answer), `SHOULD`
  (materially changes the plan), or `NICE` (would improve the result but is not blocking).
- Always propose options where genuine alternatives exist, and always give a recommendation with
  a reason. An open question with no options is harder to answer and produces vaguer answers.
- Where you have a real opinion, say so plainly. Where you do not, say that too.
- `**ANSWER:**` is left empty. Never fill it, never edit one the owner has filled.
- Cite `file:line` whenever a question refers to existing code. Unevidenced questions waste the
  owner's time and cannot be verified.
- If answering a question makes another question irrelevant, say so: *"If (a), skip Q-052."*
  This is the single biggest reducer of reviewer fatigue.

---

## Volume and structure

Target **80–140 questions**. Fewer means you have not read carefully; many more means you are
asking things the code already answers or that do not change any decision.

Organise so the questionnaire can be answered in sittings of roughly 20 questions. Group by
theme, and order themes so early answers inform later ones — scope before behaviour, behaviour
before visual detail.

Open the file with:

- A count by part, section and priority.
- A **"start here" list** of the 10 questions that unblock the most downstream work.
- An estimate of how long the whole thing takes to answer honestly.
- An explicit note that partial answers are fine and the file can be returned incomplete.

---

## Part A — current state

Generate these from what you actually found. Every question must trace to something you read.

**A1. Unexplained code.** Anything you could not work out the reason for. Deliberately odd
patterns, defensive code guarding an unclear case, a design that looks wrong but may be
intentional. Ask before assuming — this project's documentation exists precisely because
undocumented reasoning kept getting relitigated.

**A2. Half-built and abandoned.** Features that appear started but not finished, code paths
nothing reaches, UI with no backing logic, logic with no UI. For each: what exists, what is
missing, and whether to finish, remove, or leave it.

**A3. Internal inconsistency.** Two patterns doing one job, two components solving the same
problem differently, naming that diverges, error handling that differs between comparable paths.
For each: which should win, or whether the divergence is deliberate.

**A4. Known issues — confirm and prioritise.** Every bug and loose end recorded in the
documentation or in code comments. For each: is it still real, does it still matter, and what
priority. Include at minimum the ones the documentation already names — the logged-income
amount-edit desync, the non-unique import fingerprint index, the stale test-account data, any
dead columns, and every deferral recorded in the testing notes.

**A5. Rule violations.** Every place the code contradicts a rule in `CLAUDE.md`. For each: fix
the code, or amend the rule because it no longer reflects intent.

**A6. Test coverage.** Where coverage is thin on logic that moves money or drives money display.
Ask what the owner wants protected before further building, given that the test suite is the
stated safety net for the encryption phase.

**A7. Your suggestions.** Where you would genuinely do it differently — better structure,
simpler approach, a library that removes hand-rolled code, a dependency worth dropping. Be
concrete about the benefit and honest about the migration cost. Do not suggest change for its own
sake; this codebase has deliberate hand-rolled choices (the money formatter, the CSV tokenizer,
inline SVG charts) with reasoning in the decision log — read it before proposing to undo one.

**A8. Data and schema.** Anything in the live schema that is unused, ambiguous, or contradicted
by the code. Dead columns, nullable fields that are always populated, constraints that do not
match app behaviour, and whether the reset function should cover the import tables.

---

## Part B — target state

These sections are required. Personalise each question with what the code shows, but do not drop
a section because the documentation seems to answer it — the documentation is what we are
replacing.

**B1. Definition of done.** What does "finished" mean for this app? Is it a personal tool that
happens to have multi-user support, or a product intended for real users beyond the owner and one
collaborator? The answer changes everything downstream — how much polish, how much error
handling, whether onboarding matters, whether the free-tier user ceiling is a real constraint.
Ask what the owner would be happy to stop at, and what would make them consider it incomplete.

**B2. Remaining scope, item by item.** For every phase and parked item currently on the books —
privacy mode, dashboard rebuild, backup/restore, client-side encryption, investment wallet type,
natural-language AI entry — ask: still wanted, still in this shape, and how it ranks. Ask
separately what is *not* on the books that the owner wants. Ask explicitly what should be
**cut** — a scope list that only grows is not a plan.

**B3. Feature behaviour.** For each feature that survives B2, the specific behavioural questions
its build would otherwise have to guess. Derive these from the code. For example: does privacy
mode mask charts and projections as well as numeric displays, and does it survive reload; does
backup include or exclude imported transactions; what happens to a wallet's history when the
wallet is deleted. One block per real ambiguity, not a generic checklist.

**B4. Visual direction and layout.** How the finished app should look and feel. Whether the
current design system is the final answer or a stage. Page-by-page: is this layout final, does it
need rework, or is it a placeholder. What the owner likes and dislikes in what exists now. Any
reference apps or aesthetics they want to move toward. Whether density, information hierarchy or
navigation should change. Ask what the *first screen* should communicate, since that question
drives the dashboard rebuild entirely.

**B5. Platform and reach.** Mobile: is a responsive or dedicated mobile experience wanted, and at
what priority — this is a personal-finance app, which is a phone use case, and the answer
materially changes the layout work. Also: offline behaviour, the custom domain, and whether the
app is expected to stay on the Supabase free tier.

**B6. Data, privacy and trust.** How strongly the owner feels about the encryption ambition given
its documented cost — loss of DB-side atomicity and filtering, and unrecoverable data if a
password is forgotten. What data sensitivity really requires. Whether admin-visible data is
acceptable indefinitely. What the backup story must guarantee.

**B7. Collaboration.** How the second developer's work fits the plan, what they own, and whether
the branch/PR discipline holds. Whether anything in the roadmap depends on them.

**B8. Working style and autonomy.** What the owner wants to review versus delegate. Which
categories of change require approval, which can run unsupervised. Where human gates belong.
Tolerance for autonomous agents working unattended, and what they must never do without asking.
Frame these concretely against the work that actually remains, not in the abstract.

**B9. Constraints.** Time available, budget, deadlines, and anything external that constrains
sequencing.

---

## Closing section

End `QUESTIONNAIRE.md` with:

- **Questions you could not formulate** — areas where you sensed something unresolved but could
  not turn it into a clean question. Say what is murky.
- **Assumptions you are currently making** — things you would proceed on if nobody answered.
  These are the highest-risk items in the whole document, because they are where silent drift
  starts. List them explicitly.
- **What you would ask if you could only ask five questions.** This is the honesty check on
  everything above.

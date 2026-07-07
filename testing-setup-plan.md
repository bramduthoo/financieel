# Testing and CI setup plan for Financieel

This document is a handoff note to kickstart setting up automated testing,
continuous integration, and merge protection for the Financieel project.
Feed it back into a conversation to resume this topic from a shared starting point.

## Why we want this

Two people work on the project through GitHub branches and pull requests.
A new feature can silently break an existing one, and a broken main branch
has already happened once (an unresolved merge with conflict markers reached
main). Automated tests that run on every pull request would catch both
problems before they merge: a feature that breaks, and a feature that breaks
something else (a regression).

The goal is to move from "we hope nothing broke" to "the tests confirm
nothing broke, automatically, on every pull request."

## The layers of testing (concepts)

1. Unit tests
   Check one small piece of logic in isolation. Fast, precise.
   Ideal targets in this project: the pure logic in src/lib/, especially
   distributeIncome (income split across wallets), the balance math,
   the recurring date generation in recurringUtils, and the dashboard
   calculations in dashboardCalcs. These are pure functions with no UI or
   database, so they are the easiest and most valuable place to start.
   Financial correctness matters most here: a silent bug in distribution
   math means someone's money is wrong.

2. Integration tests
   Check that pieces work together, often including the database.
   Example: confirming a payment records a transaction AND decrements the
   wallet balance correctly.

3. End-to-end (E2E) tests
   Simulate a real user clicking through the running app in a browser.
   Example: sign up, log in, create a wallet, add a transaction, verify it
   appears. Most realistic, slowest, most effort to maintain.

## Recommended tools (all free, fit this stack)

- Vitest: unit and integration test runner, made by the Vite team, integrates
  seamlessly with this Vite project. This is where to start.
- React Testing Library: tests React components (render and behaviour given
  props and user interaction). For later, once lib/ logic is covered.
- Playwright (or Cypress): end-to-end browser tests for full user journeys.
  Latest phase, optional.

## Continuous Integration (CI)

GitHub Actions runs the tests automatically on every pull request. Free at
this project's scale. A small config file (.github/workflows/test.yml)
describes: on every pull request, install dependencies and run the tests.
GitHub then shows a green check or red X on the PR.

Tie-in to branch protection: the existing "protect main" ruleset has a
"Require status checks to pass" option that was left unticked. Once tests
run in CI, ticking that option makes a failing test BLOCK the merge
automatically. This is the mechanism that prevents broken or regression-
causing code from ever reaching main without anyone having to remember to
check. (Note: ruleset enforcement on a free private repo is limited; full
enforcement needs a paid GitHub plan or a public repo. The CI itself still
runs and shows results regardless.)

## Recommended sequencing (high value, low effort first)

Phase 1 (start here):
- Add Vitest to the project.
- Write unit tests for the most important pure-logic functions in src/lib/:
  distributeIncome, the balance calculations, recurringUtils date
  generation, dashboardCalcs projections.
- These are the most important (financial correctness), easiest to test
  (pure functions), and most painful if they break silently.

Phase 2:
- Set up GitHub Actions to run the Vitest suite on every pull request.
- Tick "Require status checks to pass" in the branch protection ruleset.

Phase 3 (optional, later):
- React Testing Library for key components.
- Playwright for a few critical end-to-end journeys (signup, add transaction).

## What to do when resuming this topic

1. Confirm the current state of src/lib/ (the functions may have evolved).
2. Pick the two or three most important lib/ functions to test first.
3. Write Claude Code instructions to:
   - Add Vitest and configure it for the Vite project.
   - Write a starter set of unit tests for the chosen functions, covering
     normal cases and edge cases (empty inputs, zero amounts, negative
     balances, capped wallets, the Unallocated remainder, etc.).
   - Add a .github/workflows/test.yml that runs the tests on every PR.
4. Run the tests locally, confirm they pass, then push and verify the
   GitHub Action runs on the pull request.
5. Once green, tick "Require status checks to pass" in branch protection.

## Note on ordering relative to the encryption project

If the data-encryption project goes ahead, the testing infrastructure should
exist FIRST. Encryption logic is exactly the kind of code that fails silently
(it does not crash, it corrupts or exposes data), so you want unit tests
around it before trusting it with real data. Build tests first, then
encryption with tests written alongside.

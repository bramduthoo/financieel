# Testing notes — Vitest behaviour-test phase

Autonomous session, branch `b/testing-setup`. This file records decisions, scope choices, and
anything I deliberately did **not** do (per the "log ambiguous decisions, don't wait for input"
instruction). Written for later review.

## What was built

- **Vitest** installed as a devDependency. Dedicated `vitest.config.js` (separate from
  `vite.config.js`) runs in the `node` environment — the `lib/` logic under test is pure (no React,
  no DOM), so jsdom is unnecessary. `include: ['src/**/*.test.js']`.
- npm scripts: `test` (`vitest run`, one-shot for CI) and `test:watch` (`vitest`, interactive).
- **41 tests across 4 files**, all green, all **behaviour** tests: they assert the euro outcomes
  (which wallet received how much, the resolved split, the generated dates, the month metrics),
  never internal call order. This is deliberate so the suite survives the future encryption
  migration (PROJECT-CONTEXT §7): the correct euro answer is the same whether the math runs in JS,
  SQL, or an encrypted layer.

### Files
- `src/lib/distributeIncome.test.js` — the priority target. 12 tests.
- `src/lib/unallocatedPlans.test.js` — 13 tests.
- `src/lib/recurringUtils.test.js` — 10 tests.
- `src/lib/dashboardCalcs.test.js` — 6 tests.

## How the Supabase boundary is mocked

`distributeIncome` and `unallocatedPlans.firePlan` have no return value that describes the money
they move — their observable behaviour **is** the `increment_wallet_balance` /
`distribute_from_unallocated` RPC calls and the inserted `transactions` rows. So the tests
`vi.mock('./supabase', …)` and read those calls back, then **aggregate them into per-wallet euro
totals** and assert on the totals. Aggregating (rather than asserting "rpc called with X then Y")
keeps the assertion at the behaviour level: it checks *how much money each wallet ended up with*,
which is invariant under refactors, not the sequence of internal calls.

## Coverage of the behaviours the brief asked for

| Required behaviour | Where covered |
|---|---|
| manual/template income ignores caps entirely (full amount credited) | `distributeIncome.test.js` — "manual / template income" block (incl. cap-reduction-enabled-but-ignored) |
| automated capped wallet: cap-fill with overflow to Unallocated | `distributeIncome.test.js` — "cap-fill" |
| automated capped: cap-reduction (amount×rate, rest to Unallocated) | `distributeIncome.test.js` — "cap-reduction" |
| automated at-cap with reduction OFF → all to Unallocated | `distributeIncome.test.js` — "at cap with reduction OFF" |
| percentages resolve as % of TOTAL input, never of remainder | `unallocatedPlans.test.js` — the 60/40 split proves w2 = 40% of total (16 would prove remainder) |
| remainder-sweep fills exactly total minus distributed | **Not unit-tested** — see "Not covered" below |
| rounding: credits sum to the amount within 0.005 | `distributeIncome.test.js` — "rounding & conservation" (fractional rate 0.3333) |
| one credit transaction per credit, stamped with income_entry_id | `distributeIncome.test.js` — "transaction rows" |

## Decisions & scope choices (conservative defaults)

1. **`distributeIncome` receives PRE-RESOLVED euro amounts** (`[{wallet_id, amount}]`). It is the
   "dumb executor" described in PROJECT-CONTEXT §5 — it does **not** compute the euro/% split or the
   remainder sweep. Therefore the "% of total" and "remainder-sweep" behaviours cannot be tested
   *through* `distributeIncome`.
   - The **"% of total, not remainder"** rule *is* still tested in lib, via
     `unallocatedPlans.firePlan`, whose item resolution is explicitly the same rule as
     DistributionPopup ("percent = that % of the amount"). See the code comment at
     `unallocatedPlans.js:32`.

2. **Not covered (and why), documented instead of refactored** — the hard constraint forbids
   modifying any `src/` file except test files:
   - **The canonical euro/% resolver and the remainder-sweep checkbox live inside
     `src/components/DistributionPopup.jsx`** (a React component), inline at confirm time — there is
     no exported pure function to unit-test. Extracting one would be a `src/` change (forbidden this
     session). Recommend a follow-up refactor: lift the resolver into `src/lib/` (e.g.
     `resolveDistribution(rows, total)`) so the sweep + %-of-total can be unit-tested directly at the
     source. The equivalent resolution logic is covered today via `firePlan`.
   - **Time-relative dashboard functions** (`calculateProjectedCash`,
     `getProjectedBalanceTimeline`, `getOverduePayments`, `getUnderfundedWallets`,
     `getHistoricalSeries`, `getYearlySeries`) key off `new Date()` (wall-clock "today"). Asserting
     exact euro outputs would make the suite flaky/time-dependent. Covered the **deterministic,
     month-parameterised** calcs instead (`calculateMonthMetrics`, `calculateMonthlyAverage`,
     `calculateMonthOutlook`, `getOverspentWallets`) plus the shared date-generation building blocks
     in `recurringUtils`. A follow-up could inject a `now` parameter (a `src/` change) to make the
     projection functions testable deterministically.

3. **`evaluateUnallocatedPlans` not unit-tested.** It is DB-query orchestration (fetches wallet
   balance + active plans, writes pending-conflict rows) rather than pure euro logic; unit-testing it
   would mean mocking a multi-call query-builder chain and would assert call patterns, not euro
   outcomes. Its core decision logic — `planAmount` eligibility and `firePlan` resolution/guard — is
   covered directly. Its multi-plan-stall branching is a candidate for a later integration test.

4. **Timezone stability:** date tests assert on `format(d, 'yyyy-MM-dd')` strings and use mid-month
   transaction dates, so they pass identically on the UTC CI runner and the owner's local machine.

## Discrepancies between code and docs

**None found.** The brief said "if code and docs disagree, the code is the spec; note it here." The
capped-wallet behaviour in `distributeIncome.js` matches PROJECT-CONTEXT §5 exactly (cap-fill →
overflow; cap-reduction = amount × rate with remainder to Unallocated; at-cap-reduction-off → all to
Unallocated; manual/template ignores caps). No test was written to a doc claim the code contradicts.

## Not done / blockers

No blockers. The only "not done" items are the refactor-gated ones listed under decision 2, which
are deliberately out of scope for a test-only session and are recommended as follow-ups.

---

## Update — 2026-07-08 (branch `b/testing-finish`): resolver lift + dashboard deferral

**Gap 2, first item — CLOSED.** The euro/% resolver + remainder-sweep were lifted out of
`DistributionPopup.jsx` into a pure module **`src/lib/resolveDistribution.js`** and are now directly
unit-tested (`src/lib/resolveDistribution.test.js`, 18 tests):
- `resolveRowExact(mode, value, base)` — the per-item primitive (unrounded).
- `resolveDistribution(rows, total, { sendRemainder, unallocatedWalletId })` — full resolver
  returning `explicit / distributed / remainder / complete / notOver / remainderRow / allRows /
  distributions`, preserving row order (rule `priority`).
- This was a **pure code move**: `DistributionPopup.jsx` now calls the resolver; behaviour is
  identical, `onConfirm(distributions, meta)` shape unchanged. Verified by the full suite (59 green),
  a line-by-line code-reviewer parity check, a production `vite build`, and a Playwright smoke (app
  mounts, `/login` renders, zero console errors). The authenticated popup flow (mixed euro/% + sweep)
  is a **manual step for the owner** — see the PR description / final report — because Playwright's
  fresh context has no Supabase session; db-verifier (invariants 1 & 2) to be run on that entry.

**Shared-primitive decision (answers the brief's "only if truly identical").** `firePlan`
(`unallocatedPlans.js`) now calls `resolveRowExact` for its per-item math — the truly-identical part.
Its own base (`planAmount`), unrounded-sum guard, and no-sweep behaviour stay in `firePlan`; the full
`resolveDistribution` was **not** forced onto it, because its guard needs the unrounded running sum
the popup resolver doesn't expose. The existing 13 `firePlan` tests pass unchanged, proving parity.
- *Awareness note (no runtime impact):* the old `firePlan` defaulted an **unknown** `mode` to
  euro/literal; `resolveRowExact` defaults unknown modes to percent. Plan/rule items are only ever
  `'euro'` or `'percent'` (DB CHECK), so the two valid modes are byte-identical and nothing changes in
  practice — noted only so a future reader isn't surprised.

**Dashboard `now`-parameter testability — DEFERRED (plan of record).** Gap 2's second item (injecting
a `now` param into the time-relative projection functions so they're deterministically testable) is
**deliberately NOT done here** and is deferred to the **dashboard rebuild** phase (PROJECT-CONTEXT §6
feature #4). Rationale: those functions will be reworked in that phase, so adding a seam now would be
churn; the deterministic month-scoped calcs remain covered in the meantime.

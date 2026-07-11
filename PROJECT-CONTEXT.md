# Financieel — Central Project Context

> Living master context for the Financieel project. A brand-new chat with no prior history should
> be able to read this one file (plus the relevant companion plan file) and continue work with full
> understanding. Keep it current: at the end of each working chat, fold the changes/decisions back in.
>
> **New chat reading this: this file + the live Supabase database are ground truth. Where this
> conflicts with older docs (the `Cursus/` course files, parts of `ARCHITECTURE.md`), this file and
> the live DB win. Verify against the live DB before building; do not assume.**

---

## 0. How to use this file (for the assistant)

- Authoritative for intent, decisions, conventions, and current standing. The live Supabase DB is
  the ultimate truth for schema.
- Verify, don't assume: read the real DB via the Supabase connector, and have Claude Code read the
  real source files, before building. Multiple painful incidents in this project came from acting on
  an assumed/remembered state instead of the real one (see section 8).
- Token discipline: this project runs **one chat per phase** to avoid reprocessing irrelevant
  history. Don't drag unrelated past work into the current task. Update section 6 and section 7 when a phase ends.

---

## 1. What the project is

**Financieel** is a personal-finance / budgeting web app built around a **wallet** model. Income
arrives and is distributed across wallets (fixed-budget, variable, capped, investment, plus a special
"Unallocated" catch-all). The app tracks balances, recurring income and expenses, and a projected
future balance.

**Owner/developer:** Bram Duthoo. **Collaborator:** a friend — GitHub user `woholvoe`, whose work
shows up under the name "WOUTER" in branches/commits. Two-person project, GitHub branches + PRs.

**Origin:** started as a personal budgeting tool, grew into a multi-user web app. A teaching course
(`Cursus/`) was written alongside to explain the codebase to entry-level developers.

---

## 2. Tech stack & infrastructure

- **Frontend:** React 19 + Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), React Router v7. Dark mode
  via `ThemeContext` (`src/lib/ThemeContext.jsx`).
- **Icons:** lucide-react. **Dates:** date-fns. **Charts:** inline SVG only (no chart library).
- **Backend/DB/Auth:** Supabase (PostgreSQL). Project ID: `duyttdjfvblhhjihybal`.
- **Hosting:** Vercel, auto-deploys from GitHub `main`. **`vercel.json`** in the repo root rewrites
  all paths to `/index.html` (SPA routing) so refreshing on a sub-route doesn't 404. This was added
  during the multi-user work specifically because new routes (e.g. `/reset-password`) 404'd on refresh.
- **Repo:** github.com/bramduthoo/financieel (personal account, **free private plan**).
- **Live URL:** https://financieel-sepia.vercel.app
- **Custom domain:** financieel-app.com (bought via Cloudflare, ~$10/yr, at-cost). Used for sending
  auth email. Not currently pointed at the website (the Vercel subdomain is still the live URL);
  pointing it at the site later is optional and free.
- **Local path (owner's machine, Windows):** C:\Users\bduthoo\Documents\financieel
- **In-repo reference:** `CLAUDE.md` in the repo root is the always-loaded entry doc for Claude Code
  (project rules, commands, stack, design system, hooks). `ARCHITECTURE.md` has been **retired to a
  pointer** — it and the `Cursus/` DB docs are **outdated** vs the live schema; do not trust them.
  Ground-truth order: live Supabase DB > this file > `CLAUDE.md`.

### Email / auth configuration (important, easy to forget)
- **Resend** sends Supabase's auth emails (signup verification, password reset) via SMTP
  (host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key). Sender:
  `noreply@financieel-app.com`. The `financieel-app.com` domain is **verified in Resend**, set up via
  Resend's automatic Cloudflare DNS integration (SPF/DKIM records written automatically).
- Before the domain was verified, Resend's test domain only delivered to the owner's own address;
  verifying the domain is what unlocked sending to anyone (e.g. the friend). The accountability that
  DNS records prove is what makes Gmail/Outlook accept the mail.
- **Supabase Auth, URL Configuration:** Site URL is set to the production Vercel URL, and Redirect
  URLs whitelist **both** `https://financieel-sepia.vercel.app/**` and `http://localhost:5173/**`.
  This was set because verification links were defaulting to `localhost` (unreachable from a phone);
  the signup call uses `emailRedirectTo: window.location.origin`, and the Site URL is the safety net
  so production signups always get production links.

---

## 3. Tooling & workflow conventions

### Division of labour
- **This chat assistant, has the Supabase connector with read-WRITE access** (`execute_sql`,
  `apply_migration`): planning, design, mockups, writing/applying/**verifying SQL migrations directly
  against the live DB**, verifying data after the owner's UI tests, writing Claude Code instructions.
  Discipline: **read first, show the change, apply only with the owner's go-ahead.**
- **Claude Code (owner's terminal/IDE):** all frontend file changes. Cannot run a browser. It now has
  a **read-only** Supabase MCP server (`claude_ai_Supabase`) for verifying schema/data — used by the
  `db-verifier` subagent and the `db-migration` skill's read-first/verify-after steps. It still does
  **not** apply write migrations: those go through the owner's channel (chat assistant's write
  connector or the SQL Editor). Don't rely on Claude Code to *apply* DB changes. (Earlier a migration
  was *assumed* applied via MCP and silently never ran — see section 8.)
- **The owner (Bram):** drives UI testing on localhost, runs Claude Code, runs git, clicks flows.
  The assistant verifies resulting data via the connector. Neither the assistant nor Claude Code can
  click the UI; full UI automation would need Playwright (deferred to the testing phase).

### Connectors status
- **Supabase connector:** connected, read-WRITE (it auto-connected with default/standard scope rather
  than the read-only we'd discussed; treat write power with care).
- **GitHub connector:** **NOT connected**, the owner couldn't find it in the connector list. So the
  assistant cannot read the repo/PRs/Actions directly; rely on the owner pasting relevant bits. If it
  becomes available later, it would help the testing/CI phase and merge diagnosis.

### Claude Code instruction conventions
- `CLAUDE.md` loads automatically; have Claude Code read the actual relevant source/DB before changing
  anything (never trust ARCHITECTURE.md or `Cursus/` for schema).
- For anything risky, tell it to explain its plan and **wait for approval** before writing code.
- "Do not change logic/signatures/queries beyond scope." It should report exactly what it changed.
- Keep the risky/atomic balance logic in **DB functions written & verified by the assistant**; Claude
  Code only calls them via `supabase.rpc(...)`. (This is how Fix C was done.)
- Don't paste full Claude Code outputs back into chat, paste the key changes/decisions or a short
  summary (token discipline).

### Git conventions
- Branch prefixes: `b/` (Bram), `f/` (friend). PRs into `main`, then merge. **Never force-push** once
  the friend is active.
- A branch-protection ruleset ("protect main", requires PRs, blocks force-push, restricts deletion)
  exists, but **enforcement does NOT apply on the free private plan**, GitHub showed this explicitly.
  So protection in practice is **discipline**: always branch + PR, never push directly to main. Real
  enforcement would need GitHub Team (paid) or a public repo.
- Windows/PowerShell: use `Remove-Item -Recurse -Force` (not `rm -rf`); commit with `git commit -m`
  (avoids vim swap-file issues); LF to CRLF warnings are harmless; `git rm -r -f <folder>` to remove a
  tracked folder that has staged changes.
- A genuinely useful git fact learned here: `git grep -l "<<<<<<< HEAD" origin/main` returns exit
  code 1 (and empty output) when **no** conflict markers are found, that "failure" is the good result.

### Token discipline (why this file exists)
- **One chat per phase/feature.** End a chat when its phase is done; start the next fresh, feeding it
  this file + the relevant plan `.md`. The dominant token cost is re-reading the whole history every
  turn, so a long mega-chat carrying unrelated past phases is the main waste. (This file was created
  to solve exactly that.)
- Also: don't paste full Claude Code dumps; keep big investigation reports in files; assistant runs
  narrow DB queries and doesn't re-verify confirmed things.

---

## 4. Database, current live schema (post-migrations)

> **CRITICAL GOTCHA: there are NO SQL migration files in the repo.** Every schema change in this
> project has been applied **manually**, early ones via the Supabase SQL Editor, later ones via the
> assistant's `apply_migration` connector. The repo (and the `Cursus/` DDL) does **not** reflect the
> live schema. The **live database is the only complete source of truth for schema.** A new chat must
> read the live DB, not trust the course docs.

### RLS pattern (every user-data table)
- Nullable `user_id uuid`, FK to `auth.users(id) ON DELETE CASCADE`.
- RLS enabled; **four policies** per table named `{table}_{cmd}_own` (select/insert/update/delete),
  role `public`, condition `user_id = auth.uid()`. (Verified live: e.g. `wallets_select_own` etc.)
- Frontend stamps `user_id` on inserts (helper `getCurrentUserId()` in `src/lib/supabase.js`); RPC
  functions use `auth.uid()`.

### Signup trigger
- `handle_new_user()` on `auth.users` AFTER INSERT (SECURITY DEFINER) creates, per new user: a
  `settings` row (EUR, euro symbol, month_start_day 1, light theme, strict_distribution true) and an
  `Unallocated` wallet (type `unallocated`, is_system true, sort_order ~9999).

### Core tables
- **wallets**: name, type (`fixed`/`variable`/`investment`/`unallocated`), budget_type
  (`recurring`/`accumulating`/`capped`/`none`/`unallocated`), budget (cap for capped wallets), balance
  (RPC-only writes), colour, icon, is_active, is_system (true only for Unallocated), sort_order,
  cap_reduction_enabled bool, cap_reduction_rate numeric (fraction 0 to 1, stored as %/100), created_at,
  user_id.
- **transactions**: wallet_id, type (`credit`/`debit`), amount, date, note, is_confirmed,
  **income_entry_id** (uuid, nullable, FK to income_entries ON DELETE SET NULL, added in Fix C so a
  logged income reliably links to its credit rows), user_id. (Also used for fixed-wallet payment
  confirmation and variable-wallet debits, not just income.)
- **income_entries**: amount, source, date, source_type (`manual`/`template`/`recurring`),
  income_template_id (nullable), income_recurring_id (nullable), user_id.
- **income_recurring**: name, amount, frequency, day_of_month, start_date, end_date, parent_rule_id
  (self-ref), user_id. No distribution columns of its own (its distribution lives in
  income_distribution_rules).
- **income_templates**: name, amount, note, **send_remainder bool** (added in Fix B), user_id.
  Carries a distribution via `income_template_distribution_items`.
- **recurring_rules**: recurring EXPENSE rules (separate concept from income_recurring). user_id.
- **budget_allocations**: user_id.
- **settings**: currency, currency_symbol, month_start_day, theme, strict_distribution (governs
  manual/template distribution strictness only), user_id. One row per user.

### Distribution tables (after the distribution-redesign migrations done in this project)
- **income_distribution_rules** (the saved distribution for a recurring income): income_recurring_id,
  wallet_id, priority, created_at, user_id, **amount** (legacy euro, kept in sync during transition),
  **mode** (`percent`|`euro`, CHECK), **value** (raw entered value). Existing rows were backfilled to
  mode=euro, value=amount.
- **income_template_distribution_items** (per-income-template distribution): income_template_id (FK to
  income_templates ON DELETE CASCADE), wallet_id, mode, value, created_at, user_id. This **replaced**
  the briefly-created standalone `income_distribution_templates` (+items), which were **dropped**,
  distribution-only templates are NOT a concept; distributions attach to income templates.
- **unallocated_templates** + **unallocated_template_items**: reusable named manual-distribution
  templates for sending money OUT of Unallocated. Items: template_id, wallet_id (destination), mode,
  value, user_id. **Separate pool** from income templates.
- **unallocated_plans** + **unallocated_plan_items**: automatic threshold-triggered plans on the
  Unallocated wallet. Plan: name, threshold, distribute_mode (`fixed_amount`/`amount_over_threshold`/
  `full_balance`, default amount_over_threshold), distribute_amount (nullable; required when
  fixed_amount, via CHECK), is_active, user_id. Items: plan_id, wallet_id, mode, value, user_id.

### RPC functions (created/used in this project)
- `increment_wallet_balance(p_wallet_id, p_amount)` / `decrement_wallet_balance(...)`: atomic
  `balance = balance +/- amount`. Plain SECURITY INVOKER (RLS applies). All balance changes go through
  these (or through the transactional functions below).
- `edit_income_distribution(p_income_entry_id, p_new_credits jsonb, p_source_name, p_date)`:
  **transactional, all-or-nothing** edit of a logged income's distribution. Reverses existing linked
  credits (decrement by stored amounts), deletes them, then increments wallets and inserts fresh
  linked credit rows for the new split. Validates entry+wallets owned by caller and that new credits
  sum to the income amount (within 0.005). Leaves income_entries untouched. SECURITY INVOKER. **Written by
  the assistant and verified correct against the live DB** (a self-contained set-up/edit/assert/teardown
  test confirmed reverse+reapply nets exactly, no drift, with no residue left behind).

- `reset_user_data(p_full boolean)`: **transactional two-tier data reset**, SECURITY INVOKER,
  `search_path=''`, everything scoped to `auth.uid()` (raises if null). Always deletes the caller's
  `transactions`, `income_entries`, `budget_allocations`, `unallocated_pending_conflicts` and resets
  every wallet `balance` to 0 **inside the function** (this is why the Settings delete flow no longer
  writes `wallets.balance` from the client). `p_full=true` additionally deletes
  `income_distribution_rules`, `income_recurring`, `recurring_rules`, `income_templates` (+items),
  `unallocated_templates` (+items), `unallocated_plans` (+items). Always keeps wallets (incl.
  Unallocated) + the settings row. Powers Settings → Danger zone "Clear activity" / "Full reset".
  **Verified against the live DB** (seed→clear→full under a real test-user session; activity cleared &
  balances zeroed while structure survived clear-tier, structure gone after full-tier, another user's
  15-table counts unchanged).

> Note on testing SECURITY INVOKER functions via the connector: `auth.uid()` is **null** when the
> assistant runs raw SQL (not an app session). Test by setting `request.jwt.claims` to a real user id
> inside a `DO $$ ... $$` block, exercise the function, assert, then **clean up all test data**.
> (Alternatively — as done for `reset_user_data` — drive it through an authenticated `supabase-js`
> session with the test account so RLS + `auth.uid()` are real.)

---

## 5. Major features & how they work

### Dashboard (Monarch-style redesign, DONE)
Locked design system: `bg-stone-50` page; white cards `border-stone-200 rounded-2xl p-5`; hero
numbers `text-3xl font-medium tracking-tight` (never bold/semibold); tiny labels `text-[11px]
uppercase tracking-wider text-gray-400`; coral accent `#D85A30`; positive `#3B6D11`; negative
`#A32D2D`; primary buttons `bg-gray-900`. Projected-balance chart: euro-axis, dashed zero baseline,
red-below/green-above-zero fill, event dots with dd/mm labels. Dark mode throughout via ThemeContext.

### Multi-user (DONE, deployed)
Every user-data table has user_id + per-user RLS (the `{table}_{cmd}_own` pattern). Open signup with
email verification (Resend). Login page has Log in / Sign up tabs, forgot-password, and a
ResetPassword page (`src/pages/ResetPassword.jsx`). Signup trigger auto-creates settings + Unallocated
wallet. Isolation verified (users can't see each other's data). Signup success message:
"Almost there / If this email isn't already registered, you'll receive a verification link shortly.
If you already have an account, please log in instead." (chosen because Supabase's anti-enumeration
behaviour means the client can't reliably detect already-registered emails, and this wording stops
people waiting forever).
- **Admin visibility is intentional:** the Supabase dashboard / service role bypasses RLS and can see
  all data. Protection is **between users**, not from the owner. (Hiding data even from admin is the
  future encryption phase.) Keep the Supabase account itself well-secured (strong password, ideally 2FA).
- Sessions persist per-browser/device (token in browser storage), so staying logged in across reopens
  is normal and does not leak across devices/accounts.

### Income distribution (REDESIGN — DONE, see section 6)
- `src/lib/distributeIncome.js` is a **"dumb executor"**: it takes a resolved `[{wallet_id, amount}]`
  list and credits wallets via `increment_wallet_balance`, inserting one credit transaction per credit
  (now stamped with `income_entry_id`). It does **not** compute the split.
  - **Capped-wallet behaviour lives here and matters:** for **manual/template** income (`isAutomated =
    false`) it ignores caps entirely and credits the full amount. For **automated/recurring** income
    (`isAutomated = true`) on a `capped` wallet it does cap-fill (fill to cap, overflow to Unallocated),
    or cap-reduction (credit `amount * cap_reduction_rate`, rest to Unallocated) if enabled, or routes
    the whole amount to Unallocated if at cap with reduction off.
- `src/components/DistributionPopup.jsx` is the UI, rebuilt to support **mixed euro/% per wallet**: each
  row has a euro/% toggle; a top global toggle **converts** all values between euro/% (never wipes); wallets
  grouped by type; **Unallocated appears as a selectable row**; a **"send remainder to Unallocated"**
  checkbox auto-fills `total - distributed`; **two live side-by-side progress bars** (euro and %).
  Percentages are **always of total input**. The popup resolves everything to euros at confirm time;
  the executor stays simple. Strict mode (`settings.strict_distribution`) disables Confirm until the
  resolved total equals the income amount (the sweep checkbox auto-satisfies it). Grey budget hint
  shown only for fixed/capped wallets with a non-zero budget (never "euro 0").
  - **Callback shape:** `onConfirm(distributions, meta)`. `meta.rows` = explicit per-wallet rows only;
    `meta.allRows` = explicit rows **plus** the remainder-sweep entry. Recurring-rule persistence uses
    `meta.allRows` (so the sweep is saved as a rule); each row carries `{wallet_id, mode, value, amount}`.
- **Templates = full income templates** (name + amount + note + send_remainder + distribution items).
  Created **two ways, both producing identical complete templates**: quick-entry "Save as template"
  (gated by an `allowTemplates`/`fromQuick` flag, shown only in the quick manual path) AND the manual
  "Add template" form (its Distribution section is optional). Logging a template reproduces amount +
  note + distribution + remainder flag; only the date is editable. Percentage items resolve to the
  logged amount's euros automatically (the point of storing mode+value, not euros).
- **Recurring income:** distribution saved in income_distribution_rules (mode+value, amount kept in
  sync). Recurring income does **not** fire automatically on a date, the user logs it manually from
  `IncomeRecurringDetail.jsx`. Editing a recurring income's amount must force re-doing the distribution
  to satisfy the sum constraint.
- **Inspect/edit a logged income's distribution (Fix C):** the income detail modal queries credits by
  `income_entry_id`, sums per wallet, shows a Distribution section. Editing opens DistributionPopup
  prefilled and, on confirm, calls the atomic `edit_income_distribution` RPC (no client-side balance
  math). Entries with null `income_entry_id` (older, pre-threading) show "Distribution details aren't
  available for this entry" and hide the edit control. The income_entry_id threading covers all three
  log paths: `submitQuick`, `submitLogTemplate`, and `IncomeRecurringDetail` `submitLog`.

### Unallocated wallet outbound (BUILT — DONE, see section 6)
The Unallocated wallet was previously credit-only and read-only (catches unassigned income + capped
overflow). The redesign is now built on the Unallocated detail page (`WalletDetail.jsx`, unallocated
branch): manual **"Distribute now"** (reuses DistributionPopup to send money OUT to other wallets via
a transactional move, same pattern as Fix C), reusable
**Unallocated templates** (affordable on top, unaffordable greyed at bottom, judged against current
balance), an explicit **"Create template" button** (so saving from a manual distribute isn't the only
way), automatic **threshold-plans** with on/off toggles (fire via **check-on-change** after
balance-changing actions, not a background scheduler), the **multi-plan stall** (if more than one plan
is eligible at once, any simultaneous eligibility counts as competing, even different target wallets,
halt all and present to the user to choose, surfaced **prominently on login/dashboard**, not buried),
and a **history tab**. All Stage-4 schema already exists (section 4). See `distribution-unallocated-plan.md`.

### Course / documentation (DONE for chapters written)
In `Cursus/cursus_parts/`. Chapters 1 to 3 + DB chapter + per-file lib/root chapters. Built to PDF via
Pandoc + XeLaTeX (`--pdf-engine=xelatex` required for Unicode; `build.bat` rebuilds). Style: no dashes
in prose, numbered sections, entry-level for Python/R devs with no web experience, no cross-language
comparisons. The DB chapter is now outdated vs the live schema.

---

## 6. Current standing (update this when a phase ends)

**Income-distribution & Unallocated-wallet redesign phase: DONE.**
(Verified 2026-07-07 by Claude Code against the live source files and the live DB, read-only.)

DONE & verified:
- Stage 1 (all redesign schema) — applied & verified live (the four unallocated_* tables exist).
- Stage 2 (mixed euro/% income distribution UI) — rules store correct mode/value.
- Stage 3 = **Fix B** (full income templates with distribution, both creation paths) — verified.
- **Fix A** (DistributionPopup sizing) — done.
- **Fix C** schema + `edit_income_distribution` transactional RPC — written & verified correct.
- **Fix C** frontend, NOW REVIEWED & CONFIRMED (was previously "not reviewed/tested"):
  `income_entry_id` threading on all 3 log paths + inspect/edit view live. `Income.jsx` queries
  credits by `income_entry_id` (`:98`), shows the Distribution section, gates the edit control, and
  calls `supabase.rpc('edit_income_distribution', …)` on confirm (`:1122`). Older entries with null
  `income_entry_id` correctly show "Distribution details aren't available for this entry" (`:953`).
  Live DB: 9 recent `transactions` carry `income_entry_id` (threading is actually firing).
- **Stage 4, Unallocated outbound interface — BUILT (was "DESIGNED + MOCKED").** In
  `WalletDetail.jsx` (unallocated branch): **4a** manual "Distribute now" (`:515`), **4b** reusable
  Unallocated templates + explicit "Create template" button (`:533`), **4c** threshold auto-plans
  with on/off toggle (`:590`, `:271`) firing via check-on-change, **4d** multi-plan stall via
  `UnallocatedConflictBanner` (`:476`) also surfaced on the Dashboard, **4e** history tab
  (incoming/outgoing sub-view, `:53`/`:638`). Live DB: **2 `unallocated_plans` rows, 1
  `unallocated_templates` row** — the feature is in real use.

KNOWN OPEN ISSUE (carried forward, not a blocker):
- **Amount-edit mismatch — STILL OPEN.** Editing a logged income's AMOUNT updates only the
  `income_entries` row, NOT its linked credits, so the income and its distribution desync. Flagged in
  code at `Income.jsx:221` ("KNOWN PRE-EXISTING ISSUE … intentionally not fixed here"). Fix by routing
  amount changes through the distribution editor (the atomic RPC) so they can't desync. Fold into the
  settings/feature work or a dedicated fix.

**Testing phase: DONE.** (Two autonomous Claude Code sessions, 2026-07-07/08.)

*Phase 1 — Vitest + CI (PR #4, MERGED to main).* **41 behaviour tests** across `src/lib/`:
`distributeIncome` (12 — caps ignored for manual/template; automated cap-fill+overflow, cap-reduction,
at-cap-reduction-off; rounding within 0.005; one credit row per credit stamped with
`income_entry_id`), `unallocatedPlans` (13), `recurringUtils` (10), `dashboardCalcs` (6 —
deterministic month calcs). Vitest (dedicated `vitest.config.js`, node env; scripts
`test`/`test:watch`); **GitHub Actions CI** (`.github/workflows/test.yml`) on every PR + push to main;
**Stop hook** in `.claude/settings.json` runs `npm test` on session end. Tests are **behaviour, not
implementation** (Supabase mocked at the boundary, calls aggregated to per-wallet euro totals) so they
survive the encryption migration.

*Phase 2 — resolver lift (branch `b/testing-finish`, PR #? open, 2026-07-08).* Closed the first
refactor-gated gap: the euro/% resolver + remainder-sweep were **lifted out of `DistributionPopup.jsx`
into pure `src/lib/resolveDistribution.js`** (`resolveRowExact` + `resolveDistribution`) and directly
unit-tested (18 tests). Pure code move — behaviour identical, `onConfirm(distributions, meta)` shape
unchanged; verified by full suite (**59 green**), a line-by-line code-reviewer parity check, `vite
build`, and a Playwright smoke (app mounts, zero console errors). `firePlan` now shares the per-item
primitive `resolveRowExact` (truly-identical part only; keeps its own base/guard/sweep — the 13
`firePlan` tests prove no drift). **Owner still to do:** run the manual mixed-euro/%+sweep income check
(Playwright can't log in autonomously) + db-verifier invariants 1&2 on that entry; then merge the PR.
- **Deliberately DEFERRED (plan of record):** injecting a `now` param into the time-relative dashboard
  projection functions (the 2nd refactor-gated gap) is deferred to the **dashboard rebuild** (feature
  #4 below), to avoid churn on code that phase will rework. See `docs/testing-notes.md`.
- **No `src/` logic behaviour changed** beyond the pure resolver move. No code/doc discrepancies found.
- **REMAINING (owner action):** merge PR #4's successor; tick **"Require status checks to pass"** on the
  `main` ruleset (enforcement limited on the free plan — see `testing-setup-plan.md`).

**Settings page — phase 1 (hygiene): DONE.** (Branch `b/settings-hygiene`, 2026-07-09. Recon:
`docs/settings-recon.md`.) Implemented + **verified by Claude Code** via Playwright as the test account
+ db-verifier + build/59 tests green:
- **Two-tier data reset** replacing the old client-side deletes/`wallets.balance` write (a real
  invariant-#1 violation). New `reset_user_data(p_full)` RPC (see §4) behind Settings → Danger zone
  "Clear activity" / "Full reset", each with honest deleted/kept/irreversible copy, both keeping the
  OTP confirmation. **Verified live:** seed→clear→full under a real test-user session cleared activity &
  zeroed balances while structure survived the clear tier, structure gone after full, another user's
  15-table counts untouched (db-verifier PASS).
- **In-app password change** (verify current via `signInWithPassword` → `updateUser`, min-8/match,
  never logged) — verified end-to-end (changed → re-logged-in → reverted).
- **Profile card** (account email + member-since). **Log out of all devices** (`signOut({scope:'global'})`
  + confirm) — verified (confirm → back to `/login`).
- **Dead-UI cleanup:** removed the inert `month_start_day` input (DB column left as dead); Currency card
  is an honest static "EUR €" (dead `currency`/`currency_symbol` columns left).
- Test-account plumbing: `.env.test.local` (gitignored via `*.local`); CLAUDE.md browser-testing note.
- **Owner still to do:** run one real OTP-gated delete through the UI (the OTP email can't be read
  autonomously — the underlying RPC is already live-verified); then merge the PR.

**Redesign foundation — R1 ("the blend"): DONE.** (Branch `b/redesign-foundation`, PR #7, 2026-07-10.
Spec: `DESIGN-SPEC.md` — owner-approved, direction B structure × direction C warmth, the single source
of truth for the reskin rollout.) Pure reskin + the shared money formatter + a layout-shell fix; no
business logic/query/RPC/signature changed. **Verified by Claude Code:** 67 tests green, `vite build`
clean, `design-check` + `verify-merge` clean, `code-reviewer` clean pass, Playwright (test account)
screenshots Dashboard/Wallets/Settings light+dark + an in-browser scroll proof.
- **Design tokens** in `src/index.css`: DESIGN-SPEC §2 palette as Tailwind v4 `@theme` tokens with a
  `.dark {}` block overriding the same CSS vars — so `bg-cream`/`text-ink`/`text-positive`/… auto-adapt
  per theme with almost no per-element `dark:` classes. `bg-ink text-cream` inverts cleanly (both flip).
- **`src/lib/format.js` `formatMoney()`** (+ 8 behaviour tests): European `€ 1.234,56`, hand-rolled
  (not `Intl`) for deterministic output; U+2212 negatives; `−€ 0,00` suppressed. **All ~19 euro display
  sites routed through it** (formatter-only diffs; lib math sites excluded). This is the shared formatter
  the privacy-mode plan was waiting on — privacy mode is now a trivial toggle away.
- **Reskinned:** Layout/sidebar (coral logo mark, unified icon nav, inverted active pill), Dashboard,
  and the post-hygiene **Settings** page. 3 Dashboard charts recolored per §6 via `fill-*`/`stroke-*`
  token utilities (theme-aware, still inline SVG).
- **Layout scroll-shell fix:** `main` → `min-w-0 overflow-y-auto`, root `overflow-hidden`, sidebar
  `shrink-0`. Root cause of the "vertical scroll broken on every page except Dashboard" bug: `main`
  lacked `min-w-0`, so wide content on data-heavy pages expanded it past the viewport and pushed its
  scrollbar off-screen. Now wide content is contained *inside* `main`; no horizontal page scroll.
- **De-purpled** the interactive switches (`indigo` → coral `accent-solid`). Tightened the `design-check`
  skill: its table is now the §7 token reference, and its procedure mandates an `indigo|purple|violet`
  grep + scanning a reskinned surface's full render tree.
- **Branch was rebased onto `origin/main`** after diagnosing it was cut from stale local `main` (7
  commits behind; settings-hygiene had merged as PR #6). One conflict (`DistributionPopup.jsx`) resolved
  keeping both `resolveDistribution` + `formatMoney`.
- **Owner still to do:** review/merge PR #7.

**DEFERRED from settings phase 1 (with why):**
- **Privacy mode (hide balances)** — **prerequisite now DONE:** the shared `formatMoney()`
  (`src/lib/format.js`, R1) replaced the inline `€{n.toFixed(2)}` call sites, so privacy mode is now a
  trivial toggle inside that one function (and the same formatter is what a future real-currency feature
  needs). Still unbuilt — pick it up any time.
- **Email change, account deletion, backup/export** — out of scope for hygiene (account deletion needs
  an edge function; backup is its own phase); **`month_start_day` wiring** — removed by decision, not
  wanted.

**Then — new feature list (agreed direction):**
3. **Full layout redesign — DONE** (R1 PR #7 + R2 PR #8). R1 = foundation (tokens, `formatMoney`,
   Layout+Dashboard+Settings, charts, scroll shell). **R2 = full rollout** (branch `b/redesign-rollout`):
   every remaining page/component reskinned to the blend tokens, both themes, zero logic changes —
   Wallets, WalletDetail (incl. Unallocated branch), Income (+ inline modals), IncomeRecurringDetail,
   Login/ResetPassword, and all shared modals (DistributionPopup restyled, TWO total bars kept;
   WalletModal redesigned; IncomeConfirmModal; UnallocatedConflictBanner; WalletCard icon-tile redesign).
   **Wallet identity is now the ICON, not colour:** `src/lib/walletIcons.js` registry + `<WalletIcon>`;
   icon picker in WalletModal persists `wallets.icon` (column already existed — no migration); colour
   picker removed, all colour dots replaced by icons. Verified: `npm test` 67 green, build clean,
   design-check clean (0 indigo), code-reviewer, both-theme screenshot sweep in
   `docs/redesign-screenshots/`. Tokenization used deterministic find/replace scripts + per-file fixes.
   **Small follow-up now unblocked:** privacy mode = a toggle inside `formatMoney` (all euro display
   already routes through it). **Loose end:** delete a stray `Test salary` €1000 income entry on the
   test account (created while screenshotting DistributionPopup; income row exists with no distribution).
4. **New dashboard** (content redesign — explicitly separate from the reskin).
5. **PDF transaction import.**

**Later phases (plans already written, unchanged):**
- **Backup/restore (export/import)** — `backup-restore-feature-plan.md`; prerequisite for encryption.
- **Client-side encryption** — after testing + backup; two open discussions first (atomicity;
  lost DB-side filtering/sorting). See `encryption-with-key-plan.md`.

Deferred / smaller:
- ~~Fix the delete-all-data feature properly~~ **DONE** in settings phase 1 (two-tier `reset_user_data`
  RPC; keeps settings + the Unallocated wallet; no client-side balance writes).
- Phase 7, an Investment wallet type.
- Optional AI features (friend has $20 Claude API credit; natural-language transaction entry was the
  top candidate).

---

## 7. Decision log (the "why", so new chats don't relitigate)

- **Distribution % is always of total input** (not of the remaining amount), keeps the two progress
  bars consistent.
- **Global euro/% toggle converts existing values**, never wipes them.
- **Remainder has two coexisting paths:** Unallocated as a normal assignable row AND a "send remainder
  to Unallocated" sweep checkbox (auto-fills total minus distributed).
- **Option A storage:** assignments store **mode + raw value**, euros computed at apply time, so %
  templates/rules scale to any amount. This is why rules and template items carry mode+value, and why
  the legacy `amount` column on rules is only kept in sync transitionally.
- **Income templates carry their distribution** (name+amount+note+distribution). The standalone
  "distribution-only template" idea was tried, then **dropped**. Income-template and Unallocated
  template pools are **separate**.
- **Unallocated threshold-plans fire via check-on-change** (after balance-changing actions), NOT a
  background scheduler, because balances only change through app actions, so checking then catches
  every crossing without server-side cron.
- **Multi-plan conflict = any simultaneous eligibility** (even different target wallets): halt all,
  present on login for the user to choose. Plans re-arm and fire repeatedly.
- **Editing a logged income's distribution uses a transactional Postgres function**, not client-side
  reverse/reapply, an interrupted reverse-then-reapply could remove money without restoring it
  (money-disappears failure). Risky balance logic lives in one reviewed, atomic, DB-side place; Claude
  Code only calls it.
- **Recurring income amount only changes via edit**, which then forces re-doing the distribution.
- **Testing before encryption; backup before encryption**, tests are the safety net for the
  encryption migration; backup protects users from forgotten-password data loss (password-derived key
  = unrecoverable data if forgotten).
- **Tests must be BEHAVIOUR tests, not implementation tests**, the correct euro answer is the same
  whether math runs in SQL or the browser, encrypted or not, so behaviour tests survive the encryption
  migration and even protect it. Target the pure logic in `lib/`.
- **Behaviour-test mechanics (testing phase):** for the executor functions with no return value
  (`distributeIncome`, `firePlan`), mock Supabase at the boundary and **aggregate the recorded
  RPC/insert calls into per-wallet euro totals**, then assert on the totals — never on call order.
  "How much money each wallet ended with" is the invariant; the call sequence is not. The `%`-of-total
  rule is tested via `unallocatedPlans.firePlan` (same resolver as DistributionPopup), because
  `distributeIncome` receives pre-resolved euros and never sees percentages.
- **Refactor-gated test gaps are documented, not forced:** the canonical euro/% resolver + the
  remainder-sweep live inside `DistributionPopup.jsx` (component-inline), and the projection dashboard
  calcs depend on `new Date()`. Rather than break the "no `src/` changes in a test-only session" rule,
  these are logged in `docs/testing-notes.md` with recommended follow-up refactors (lift the resolver
  to `lib/`; inject a `now` param) so they become unit-testable later.
- **A Stop hook runs the suite on session end** (`.claude/settings.json`) as a backstop so a session
  that breaks a test can't silently stop; CI (`test.yml`) is the authoritative PR gate.
- **Distribution resolution lives in pure `src/lib/resolveDistribution.js`** (lifted out of
  `DistributionPopup.jsx` so it's unit-testable). The euro/% resolution (% always of TOTAL input) and
  the remainder-sweep are now one tested function; the popup calls it and keeps only UI concerns.
  `firePlan` shares the per-item primitive `resolveRowExact` but NOT the whole resolver — its
  unrounded-sum guard and plan-derived base differ, so forcing the full resolver on it would change
  behaviour. Sharing only the truly-identical primitive is the rule for "reuse vs. duplicate" here.
- **Dashboard projection testability is deferred to the dashboard rebuild**, not bolted on now: the
  `new Date()`-dependent projection fns will be reworked in that phase, so adding a `now`-injection
  seam earlier is churn. Deterministic month-scoped calcs stay covered meanwhile.
- **One chat per phase + this central file**, to stop paying to re-read irrelevant history every turn.
- **Encryption stance:** desirable to the owner (cares about data privacy) but accepted as a large,
  later project. Key derived from password in the browser via Web Crypto (PBKDF2) + per-user salt;
  **key must never touch the server** (the whole security rests on this). Accepts loss of DB-side
  atomicity on balances and DB-side computation on encrypted fields; no user-facing feature is lost.
- **Claude Code runs on a versioned workflow config** (`CLAUDE.md` + `.claude/` hooks/skills/agents),
  and it is **verified against the live repo/DB before being trusted** — it was drafted outside the
  repo from context and had wrong assumptions (React 18/Router v6, a bad MCP server name). Config gets
  checked, not assumed, same discipline as migrations.
- **A PreToolUse Bash guard is the deterministic backstop** for the never-do rules (force-push,
  push-to-main, recursive force-delete, `npm audit fix --force`, destructive SQL, hard reset/clean).
  CLAUDE.md prose is advisory; the hook is not. Note: it's a substring guard, so a Bash command that
  merely *mentions* a blocked pattern (e.g. an `echo`/`grep`) is also blocked — feed test payloads via
  a file, not inline.
- **PostToolUse runs `eslint --fix` on edited js/jsx, non-blocking** (repo has ESLint, no Prettier).
  A lint hook must never fail an edit; real lint errors still surface via `npm run lint`. A dedicated
  formatter (Prettier) is a candidate for the testing phase.
- **Claude Code now has a read-only Supabase MCP** (`claude_ai_Supabase`) for verifying schema/data;
  **write migrations still go through the owner's channel** (db-migration skill). Read-only power does
  not change the "Claude Code never applies DB writes" rule.
- **ARCHITECTURE.md retired to a pointer**, not maintained. A second schema doc drifts and has caused
  incidents; single source of truth is live DB > PROJECT-CONTEXT.md > CLAUDE.md.
- **Data reset is two-tier, not one "delete all" button** (settings phase 1): "Clear activity" (wipe
  transactions/income/allocations/pending-conflicts + zero balances, keep templates/rules/plans) vs.
  "Full reset" (also remove the structure). One button conflated two very different intents and its copy
  lied about what it kept. `unallocated_pending_conflicts` clears in **both** tiers — it's transient
  resolution state, so leaving it would orphan rows pointing at deleted plans. All of it runs in one
  `auth.uid()`-scoped transactional RPC so balances are never written client-side.
- **`month_start_day` removed by decision** (settings phase 1): the input was inert (consumed nowhere;
  dashboard uses calendar months) and a custom budget-month start is **not wanted**. Removed the UI;
  left the DB column as dead rather than migrate it away, to avoid a write migration for nothing.
- **Privacy mode deferred to the layout redesign, on purpose** (settings phase 1): masking balances
  cleanly needs ONE shared money formatter, but amounts are currently hand-written `€{n.toFixed(2)}`
  inline across ~22 files. Brute-forcing 22 files now would be redone in the redesign (which touches
  every component anyway). **Plan of record:** the redesign introduces the shared formatter → privacy
  mode becomes a trivial toggle → and the same formatter is what a future real-currency feature needs.
- **Redesign tokens live as Tailwind v4 `@theme` CSS vars overridden under `.dark`** (R1), not a
  `tailwind.config` (there is none) and not per-element `dark:` classes. Overriding the same
  `--color-*` var in a `.dark {}` block makes every token utility auto-theme, so a component ships both
  themes almost for free. Tokens that must NOT flip in dark (solid fills) get their own `*-solid`/`*-bar`
  names. `DESIGN-SPEC.md` is the locked authority; the `design-check` skill table mirrors it.
- **`formatMoney` is hand-rolled, not `Intl.NumberFormat`** (R1): `Intl` emits a non-breaking space and
  varies by Node/ICU version, which makes behaviour tests brittle and the spec string (`€ 1.234,56`,
  normal space) non-deterministic. A tiny hand-rolled formatter gives exact, stable output. It is the
  single euro-DISPLAY path; calculation/rounding stays in the pure `lib/` modules (never routed).
- **Charts stay inline SVG but theme via `fill-*`/`stroke-*` token utilities** (R1), not a `useTheme()`
  color object — Tailwind generates `fill-{token}`/`stroke-{token}` from the same `@theme` vars, so SVG
  recolors auto-adapt with the rest. Fills that carry meaning (positive/negative) use the fixed `*-bar`
  tokens so they read in both themes.
- **The app shell scrolls via one container: `main` with `min-w-0 overflow-y-auto`** (R1). Without
  `min-w-0`, a flex child keeps `min-width:auto` and won't shrink below its content, so wide page content
  expands `main` past the viewport and shoves its scrollbar off-screen — which read as "vertical scroll
  broken on every page except Dashboard" (Dashboard content is narrow). `min-w-0` contains wide content
  inside `main` and kills horizontal page scroll. Any future page must own its own wide-content overflow.
- **Interactive controls are ink/coral, never indigo** (R1): the app shipped a lot of leftover
  `indigo-*` (Tailwind default accent). The redesign's only accent is coral (`accent-solid`, fixed both
  themes so a white knob stays visible on toggles). `indigo|purple|violet` is now an explicit
  `design-check` grep. Un-reskinned pages still carry indigo — that's later-rollout scope, not a bug.
- **The design system is now `DESIGN-SPEC.md` + the `src/index.css` tokens, applied everywhere** (R2):
  the whole app is one system; CLAUDE.md's old token prose (`bg-stone-50`, `rounded-2xl`) is retired.
  New UI uses the token utilities and passes `design-check`.
- **Wallet identity is the ICON, not the colour** (R2): the owner disliked the colour picker; wallets
  are now told apart by a chosen lucide icon (`wallets.icon`, a column that already existed unused).
  `src/lib/walletIcons.js` is the single registry + a stable `<WalletIcon>` component (never assign a
  component to a local during render — that trips react-hooks and risks remounts). `colour` is still
  stored (defaulted) for legacy rows but no longer drives any visualization.
- **Large mechanical reskins go via reviewed find/replace scripts, then per-file fixes** (R2): tokenizing
  ~20 files by hand is error-prone and context-expensive. The safe recipe: deterministic exact-pair
  className swaps (gray/stone/indigo/white→tokens, font-bold/semibold→font-medium since the design has
  only weights 400/500, rounded-xl/2xl→`rounded-[14px]`, strip now-redundant `dark:` variants because the
  base tokens auto-theme), then hand-fix the bespoke bits (tab bars, page backgrounds, inline-SVG chart
  colours, badges). Gate with `npm run build` (catches broken JSX/undefined refs), `design-check` greps,
  and a both-theme screenshot sweep — a green build alone doesn't prove the pixels.

---

## 8. Known risks / gotchas (hard-won in this project)

- **No SQL files in the repo; all migrations applied manually** (SQL Editor early, `apply_migration`
  connector later). The repo and `Cursus/` DDL lag the live schema. **Trust the live DB + this file.**
- **Verify migrations actually ran.** The original multi-user migration was *assumed* applied (Claude
  Code "had it"), but it silently never ran, the `user_id` columns/policies/trigger didn't exist,
  which broke account deletion and isolation until the migration was actually run by hand. Lesson:
  confirm schema against the live DB, never assume a migration executed.
- **Merges can silently break the running app even when the build passes.** A merge of main brought in
  18 files with committed `<<<<<<< HEAD / WOUTER` conflict markers (the friend had pushed an
  unresolved merge to main). Recovery pattern: `git merge --abort`, have the friend repair main,
  re-merge, then resolve the few real conflicts. Auto-merge also **dropped imports** (`TrendingUp`,
  `AlertCircle`) and produced a **variable-name mismatch** (`comparison` vs `trend`) that compiled but
  crashed the Dashboard to a white screen at runtime. Lesson: after any merge, **run the app and check
  the browser console**, don't trust a green build; scan merged files for dropped imports / undefined
  references.
- **Branch protection is NOT enforced on the free private plan**, rely on the branch+PR discipline.
- **`git checkout -b` off local `main` can be stale.** R1 was branched from local `main` while
  `origin/main` was 7 commits ahead (the settings-hygiene merge, PR #6, had landed) — the reskin ended up
  sitting on the *pre-hygiene* Settings page. Lesson: `git fetch` and branch off `origin/main` (or
  `merge-base`-check) before starting; if caught later, `git rebase origin/main` and re-verify with the
  `verify-merge` skill.
- **Supabase connector here is read-WRITE** (auto-connected with default scope). Assistant reads
  first, shows the change, applies only on the owner's go-ahead.
- **`auth.uid()` is null when the assistant runs raw SQL** via the connector, test SECURITY INVOKER
  functions by setting `request.jwt.claims` in a DO block, and always clean up test data.
- **GitHub connector is not connected**, no direct repo/PR/Actions visibility for the assistant.
- **Supabase free tier ceiling ~200 to 250 active users** (egress-bound). Usage model ~250 rows/user/month.
- **npm audit:** a couple of vulnerabilities exist; do NOT `npm audit fix --force` casually (can break
  the build). Address deliberately, not mid-feature.

---

## 9. Companion plan files (kept alongside this one)

- `distribution-unallocated-plan.md`, finishing distribution + the Unallocated wallet (active phase).
- `testing-setup-plan.md`, Vitest + CI testing phase.
- `backup-restore-feature-plan.md`, export/import backup feature (prerequisite for encryption).
- `encryption-with-key-plan.md`, client-side encryption (after testing + backup), incl. the two open
  discussions (atomicity, lost DB-side filtering/sorting) to resolve first.

---

*End of central context. Keep section 6 (Current standing) and section 7 (Decision log) current as work progresses.*

# Settings-page reconnaissance

Report-only recon for the upcoming settings-page **planning** session. No code changes were made.
Findings are cited to files/lines as of branch `b/testing-finish` (2026-07-08). Decisions happen in
the planning session — this is an inventory with a recommendation per item.

---

## 1. Current state

**File:** `src/pages/Settings.jsx` (~312 lines, single file). Route `/settings` wired at
`src/App.jsx:82`. Reads the single `settings` row via `supabase.from('settings').select('*').single()`
(`:65`); writes via a per-field `updateSetting(field, value)` (`.update().eq('id', settings.id)`,
debounced "Saved" toast, `:75-83`).

The `settings` table columns and how each is surfaced:

| Column | In UI? | Editable? | Reality |
|---|---|---|---|
| `theme` | ✅ | ✅ | Light/dark toggle (`:173-189`). On change: `updateSetting('theme', …)` **and** `setTheme()` to live-apply. **Fully wired.** |
| `strict_distribution` | ✅ | ✅ | OFF/ON toggle (`:191-211`). Drives DistributionPopup confirm gating (see §2). **Fully wired.** |
| `month_start_day` | ✅ | ✅ | Number input clamped 1–28 (`:160-170`). **Editable but consumed NOWHERE** — see "broken" below. |
| `currency` | ❌ | ❌ | **Dead.** Never read anywhere in `src/`. |
| `currency_symbol` | ❌ | ❌ | **Dead.** Stored but never read; the euro sign shown is a hardcoded `EUR €` literal (`:151-153`). |
| `id`, `created_at`, `user_id` | ❌ | ❌ | Internal. |

**Broken / crude:**
- **`month_start_day` is inert.** Grepping all of `src/`, it appears only at `Settings.jsx:164,167`.
  Nothing consumes it — dashboard month boundaries use date-fns `startOfMonth`/`endOfMonth`
  (`dashboardCalcs.js:55-56,143-144,195-196,238`), i.e. calendar months. The DB course doc
  (`Cursus/cursus_parts/03-database.md:422`) *claims* `dashboardCalcs.js` reads it — that claim is
  **stale**. So the input silently does nothing.
- **Currency is fake.** The "Currency" card is a static `EUR €` badge, not data-driven, not editable.
  Both `currency` and `currency_symbol` columns are dead.
- **Delete-all uses a `.neq('id', '000…')` trick** to force a bulk delete (Supabase requires a filter)
  — `Settings.jsx:110-113`. Crude but functional.

---

## 2. Adjacent wiring / blast radius

### `theme` / ThemeContext
- **File:** `src/lib/ThemeContext.jsx` (tiny — `createContext({theme, setTheme})` + `useTheme`).
- **Provider:** `src/App.jsx` — `theme` state (`:18`); fetched from `settings.theme` on session load in
  **two** places (getSession `:30-32` and onAuthStateChange `:38-40` — minor duplication). An effect
  toggles the root class: `document.documentElement.classList.toggle('dark', theme === 'dark')` (`:47`).
- **Consumers:** only `Settings.jsx:45` calls `useTheme()`. Everything else themes **implicitly** via
  Tailwind `dark:` classes off that single root class. → **Blast radius of theme changes is small**
  (one switch point), but any new setting that needs to re-render on change must go through context.

### `month_start_day`
- **Consumed nowhere** (only the two Settings.jsx lines). → Wiring it up later touches the dashboard
  calc boundaries; removing it touches only Settings. Low blast radius either way.

### `strict_distribution`
- Read into `strictMode` and passed to `DistributionPopup`:
  - `src/pages/Income.jsx:137,144` → `setStrictMode(s?.strict_distribution ?? true)`; passed at
    `:1055, 1112`. Manual "send remainder" path forces `strictMode={false}` (`:1088`); recurring paths
    force `strictMode={true}` (`Income.jsx:1146`, `IncomeRecurringDetail.jsx:502`).
  - `src/pages/WalletDetail.jsx:85,90` → passed at `:717`.
- **Gating logic** in `DistributionPopup.jsx` `canConfirm` (`:137-139`): strict mode disables Confirm
  until the split is complete (or the remainder-sweep-to-Unallocated checkbox is on). This is the only
  behavioural consumer. → Changing the setting's meaning ripples into every income/outbound
  distribution flow; the flag itself is read in 2 pages.

---

## 3. Known debt / danger zone

### Delete-all-data
- **Path:** button (`Settings.jsx:222-228`) → warning modal → `sendOtp()` (`:85-94`, emails an OTP via
  `signInWithOtp`) → code modal → `confirmDeletion()` (`:96-119`).
- **What it deletes** (`:110-113`): all rows of `transactions`, `income_entries`,
  `budget_allocations`; and **`wallets.update({ balance: 0 })`** (zeroes balances, does not delete
  wallets).
- **Re: the past incident** (which wiped `settings` + the Unallocated wallet): the **current** code does
  **not** delete the settings row and does **not** delete the Unallocated wallet — it only zeroes
  balances. So the specific incident behaviour is **not present today**. BUT:
  - ⚠️ **Invariant violation:** the direct `wallets.update({ balance: 0 })` write **breaks the
    "wallet balances are RPC-only" rule** (PROJECT-CONTEXT §Non-negotiable #1 / §4). Every other
    balance mutation goes through `increment/decrement_wallet_balance` or a transactional RPC; this
    path writes `balance` from the client. **This is the most concrete bug in the settings surface.**
  - **Incomplete + mismatched copy:** it leaves `income_recurring`, `income_templates`,
    `income_distribution_rules`, `recurring_rules`, and the `unallocated_plans`/`unallocated_templates`
    (+items) tables untouched (some intentional — "keep structure/rules"), yet the warning modal
    (`:239-244`) lists only transactions / income entries / balances / budget allocations. So
    `budget_allocations` history is wiped while plan/template state dangles, and the copy doesn't fully
    match the action.
  - Still flagged as an **open task** in PROJECT-CONTEXT (§6 "Fix the delete-all-data feature
    properly"; §Deferred). Treat as not-yet-blessed.

### Account / password / email (Supabase Auth surface)
Full inventory of `supabase.auth.*` in `src/`:
- `App.jsx:27` getSession, `:35` onAuthStateChange; `lib/supabase.js:9` getSession.
- `components/Layout.jsx:22` signOut (logout in nav).
- `pages/Login.jsx:40` signInWithPassword, `:62` signUp, `:78` resetPasswordForEmail (forgot-pw email).
- `pages/ResetPassword.jsx:16` getSession, `:20` onAuthStateChange, `:33` updateUser({ password })
  (set new password via recovery link).
- `pages/Settings.jsx:71` getUser, `:88` signInWithOtp, `:100` verifyOtp (delete-all confirmation only).

**Exists:** login, signup (email verification), logout, forgot-password → email → reset page.
**Missing (no code anywhere):**
- **Account deletion** — no `auth.admin` / `deleteUser`; would need a server/edge function. The
  "delete all data" feature is data-only, not account removal.
- **In-app password change** — no `updateUser({ password })` from Settings; only the forgot-password
  email round-trip exists.
- **Email change** — no `updateUser({ email })` anywhere.
- Settings exposes **zero** account/auth management UI (only reads `userEmail` for the OTP flow).

---

## 4. Backup / export entry point

**None in code.** Grep for `Blob`, `URL.createObjectURL`, `.download`, `createElement('a')`, `toCSV`,
`exportData`, `backupData`, `restore` across `src/**` → no matches. Only artifact is the plan doc
`backup-restore-feature-plan.md` (JSON export of all user tables; import with ID remapping; explicitly
names the **Settings page as its natural home**, `:64,84`; flags that import must *reconcile* — not
duplicate — the auto-created Unallocated wallet + settings row, `:58-59,83`). Cross-referenced in
PROJECT-CONTEXT §6/§9 as a prerequisite for the encryption phase.

---

## 5. Candidate inventory (recommendation per item — NOT decisions)

Effort: **S** ≈ <½ day, **M** ≈ 1–2 days, **L** ≈ multi-day / needs another phase.

### 5a. App-specific

| Candidate | Effort | Depends on | Recommendation |
|---|---|---|---|
| **Fix `month_start_day`** (wire into dashboard month boundaries, or remove the input) | M (wire) / S (remove) | dashboard calcs | **Decide intent first.** If custom month start is wanted → wire it (blast radius = `dashboardCalcs` boundaries), else remove the dead input. Leaning "remove now, revisit in dashboard rebuild." |
| **Real currency display** (drive UI from `currency`/`currency_symbol`, or drop the dead columns) | M | many `fmtEur` call sites | Only worth it if multi-currency is a goal; otherwise formalise EUR and delete dead columns. Low priority. |
| **Default distribution template on income** (pick a saved template applied by default) | M | income-template system (exists) | Nice UX; defer to a distribution/income phase, not core settings hygiene. |
| **Cap-reduction defaults** (default `cap_reduction_rate`/enabled for new capped wallets) | S–M | wallet creation flow | Small quality-of-life; group with wallet settings. |
| **Unallocated plan-stall notification prefs** | M | unallocated plan system (exists) | Depends on whether stalls are noisy in practice; gather need first. |
| **Backup/export entry point** | L | `backup-restore-feature-plan.md` (own phase) | **Its own phase** — Settings just hosts the button. Do not scope into a settings-hygiene pass. |

### 5b. Generic settings-page hygiene (every app should have)

| Candidate | Effort | Depends on | Recommendation |
|---|---|---|---|
| **Theme** | — | done | Already live; keep. |
| **In-app password change** (`updateUser({ password })`, requires re-auth/confirm) | S | Supabase Auth (client-side, no server) | **High value, low cost.** Straightforward client-only add. Good first hygiene win. |
| **Email change** (`updateUser({ email })` + re-verify) | M | Supabase Auth email flow + Resend config | Doable client-side but needs verification-email UX; medium. |
| **Danger zone — delete all data** (fix the RPC-only-balance violation + honest confirm copy) | M | needs a transactional/RPC reset for balances | **Fix the existing bug** regardless of new features — the direct `balance` write is a real invariant break. |
| **Danger zone — delete account** (full auth user removal) | L | **server/edge function** (`auth.admin.deleteUser`) | Cannot be done purely client-side; needs an edge function. Separate, later. |
| **Profile basics** (show email, maybe display name) | S | — | Cheap; pairs naturally with password/email management. |

**Top recommendations for the planning session:** (1) fix the delete-all balance-invariant bug; (2)
add in-app password change (cheap, client-only); (3) decide `month_start_day`'s fate (wire vs remove);
(4) keep backup/export and account-deletion as their own phases (they need a backup design and an edge
function respectively).

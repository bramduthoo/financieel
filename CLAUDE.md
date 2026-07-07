# CLAUDE.md — Financieel

Personal-finance web app built around a **wallet** model: income arrives, gets distributed
across wallets (fixed / variable / capped / investment / Unallocated), balances and projections
are tracked. Two-person project: Bram (`b/` branches) and Wouter (`f/` branches).

> **Ground truth hierarchy:** live Supabase DB > `PROJECT-CONTEXT.md` > this file > everything
> else. `ARCHITECTURE.md` and `Cursus/` docs are OUTDATED on schema. Never assume schema or
> file contents — read the real thing first.

## Commands

- Dev server: `npm run dev` (Vite, http://localhost:5173)
- Build: `npm run build`
- Preview built app: `npm run preview`
- Lint: `npm run lint` (ESLint flat config, `eslint.config.js`)
- Tests: `npm test` (Vitest, one-shot) / `npm run test:watch`. Behaviour tests for `src/lib/`
  pure logic live in `src/lib/*.test.js`; scope/decisions in `docs/testing-notes.md`. A Stop hook
  also runs `npm test` on session end; CI runs it on every PR.

## Stack

React 19 + Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), React Router v7, lucide-react, date-fns.
Charts are **inline SVG only — no chart libraries**. Supabase (PostgreSQL + Auth), project id
`duyttdjfvblhhjihybal`. Deployed on Vercel from `main` (SPA rewrite via `vercel.json` — don't
remove it).

## Claude Code hooks (this repo)

- **PreToolUse Bash guard** (`.claude/scripts/guard-bash.cjs`): deterministically blocks force-push,
  direct push to `main`, recursive force-delete, `npm audit fix --force`, destructive SQL, and hard
  reset/clean. If a Bash command is blocked with a `BLOCKED:` message, that's this guard, not a flake.
- **PostToolUse ESLint-fix** (`.claude/scripts/format-edited.cjs`): auto-runs `eslint --fix` on any
  edited `.js`/`.jsx` file. Non-blocking (never fails an edit) — it's why edits get auto-linted.

## Non-negotiable rules

1. **Wallet balances are NEVER computed or written client-side.** All balance changes go through
   DB RPC functions: `increment_wallet_balance`, `decrement_wallet_balance`,
   `edit_income_distribution`, or other reviewed transactional functions. Frontend only calls
   `supabase.rpc(...)`. Never add client-side reverse/reapply balance math.
2. **Every user-data table row carries `user_id`.** Inserts must stamp it (helper
   `getCurrentUserId()` in `src/lib/supabase.js`); RPCs rely on `auth.uid()`. Every new table
   needs RLS + the four `{table}_{cmd}_own` policies. See PROJECT-CONTEXT.md §4.
3. **Schema changes follow the `db-migration` skill.** Claude Code does not apply write
   migrations directly. Draft SQL, get approval, verify afterwards via read-only queries.
4. **Never push to `main`.** Always a `b/` branch + PR. Never force-push. (Branch protection is
   not enforced on the free plan — discipline is the protection.)
5. **Never run `npm audit fix --force`.**
6. **Distribution semantics:** percentages are always of the *total* input, never of the
   remainder. Distribution rows store `mode` + raw `value`; euros are resolved at apply time.
   `distributeIncome.js` is a dumb executor — it never computes splits.
7. **Capped-wallet behaviour** differs between manual/template income (ignores caps) and
   automated/recurring income (cap-fill / cap-reduction / overflow to Unallocated). Don't
   "simplify" this — it's intentional. See PROJECT-CONTEXT.md §5.

## Design system (locked — do not deviate without explicit approval)

- Page bg `bg-stone-50`; cards `bg-white border border-stone-200 rounded-2xl p-5`
- Hero numbers `text-3xl font-medium tracking-tight` — **never bold/semibold**
- Tiny labels `text-[11px] uppercase tracking-wider text-gray-400`
- Accent coral `#D85A30`; positive `#3B6D11`; negative `#A32D2D`; primary buttons `bg-gray-900`
- Dark mode via `ThemeContext` (`src/lib/ThemeContext.jsx`) — every new UI must support it
- Run the `design-check` skill after building or changing UI

## Workflow conventions

- **Plan mode first** for any feature or refactor; get the plan approved before writing code.
- Stay in scope: do not change logic, signatures, or queries beyond the approved plan. Report
  exactly what changed.
- After any merge or pull of `main`, run the `verify-merge` skill before trusting the result.
- Use the `code-reviewer` subagent on the diff before declaring a feature done.
- Use the `db-verifier` subagent (read-only DB) to check data invariants after flows that touch
  balances or distributions.
- End every working session with the `wrapup` skill so `PROJECT-CONTEXT.md` stays current.
- Owner's machine is **Windows / PowerShell**: `Remove-Item -Recurse -Force` not `rm -rf`;
  commit with `git commit -m "..."`; LF→CRLF warnings are harmless.

## Key references (read on demand, don't preload)

- `PROJECT-CONTEXT.md` — master context: schema (§4), features (§5), current standing (§6),
  decision log (§7), gotchas (§8). Read §6–§7 at the start of any feature session.
- `distribution-unallocated-plan.md`, `testing-setup-plan.md`, `backup-restore-feature-plan.md`,
  `encryption-with-key-plan.md` — phase plans.
- `src/lib/distributeIncome.js`, `src/components/DistributionPopup.jsx` — the heart of the
  distribution system.

# CLAUDE.md — Financieel

Personal-finance web app built around a **wallet** model: income arrives, gets distributed
across wallets (fixed / variable / capped / investment / Unallocated), balances and projections
are tracked. Single-maintainer project: Bram, working on `b/` branches.

> **Ground truth hierarchy:** live Supabase DB > `PROJECT-CONTEXT.md` > this file > everything
> else. The `Cursus/` docs are OUTDATED on schema — never trust them. (A former `ARCHITECTURE.md`
> was retired to a pointer and then deleted in 2026-09; if you find a copy in git history, it is
> wrong.) Never assume schema or file contents — read the real thing first.
>
> **Status lives in `PROJECT-CONTEXT.md` §6 and nowhere else.** If any other document appears to
> assert what is or is not built, it is stale — trust §6. Open decisions live in
> `OPEN-QUESTIONS.md`.

## Commands

- Dev server: `npm run dev` (Vite, http://localhost:5173)
- Build: `npm run build`
- Preview built app: `npm run preview`
- Lint: `npm run lint` (ESLint flat config, `eslint.config.js`) — **currently fails**: 44
  pre-existing problems (33 errors, 11 warnings) as of 2026-09-14, incl. 11
  `react-hooks/static-components`. Treat that count as the baseline; your change must not raise it.
  **CI does not run lint** — only `npm test` — so nothing else will catch a regression.
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
   automated/recurring income (fill to `cap_max` at full rate → reduce the part above the ceiling to
   `cap_reduction_rate` → overflow to `overflow_wallet_id` else Unallocated). Math lives in pure
   `src/lib/resolveCappedInflow.js`; `cap_reduction_enabled` is a dead column. Don't "simplify" this —
   it's intentional. See `docs/plans/budgeting-page-plan.md` §4 (authoritative) + PROJECT-CONTEXT.md §7.

## Design system (locked — do not deviate without explicit approval)

Live system is **"the blend"** — authority is `DESIGN-SPEC.md`; tokens are defined in `src/index.css`
(`@theme` + `.dark` overrides). **Reskin rollout is complete** (R1 + R2) **with one known exception**:
`src/App.jsx` still uses raw Tailwind palette classes in the pre-session loading screen and the signup
welcome banner. Everything else in `src/` uses the tokens.
Prefer the token utilities over raw hex; wallets are identified by their icon (`src/lib/walletIcons.js`
`<WalletIcon>`), not colour.

- Page bg `bg-cream`; cards `bg-card border border-card-border rounded-[14px]` (dark: fill-separated)
- Numbers `font-medium tracking-tight` — **never bold/semibold**
- Section labels `text-[11px] uppercase tracking-wider text-ink-muted`
- Accent coral (`accent` / `accent-solid`); positive/negative via `text-positive` / `text-negative`;
  primary buttons & active items `bg-ink text-cream` (inverts per theme). Interactive controls are
  ink/coral — **never indigo/purple**.
- Money renders via `formatMoney()` (`src/lib/format.js`) — never inline `toFixed` on amounts
- Dark mode is automatic via the tokens (`.dark` overrides the CSS vars); every new UI must support it
- Run the `design-check` skill after building or changing UI

## Workflow conventions

- **New-machine setup (per clone, not carried by the repo).** Cloning gives you `CLAUDE.md`,
  the project skills (`.claude/skills/`), hooks, and the plugin *enablement* + marketplace in
  `.claude/settings.json` — but **not** the plugin *installs* or per-machine git config. On a new
  machine: (1) install the seven official plugins once — `context7`, `supabase`, `playwright`,
  `github`, `frontend-design`, `code-review`, `typescript-lsp` from `claude-plugins-official` (the
  marketplace is pre-declared via `extraKnownMarketplaces`, so Claude Code can offer to install the
  enabled ones); (2) `git config --global fetch.prune true`.
  GitHub's auto-delete-on-merge is server-side, so it already applies.
- **Supabase MCP auth gotcha.** The plugin starts each session needing authorization. If the consent
  link returns `{"message":"Unrecognized client_id"}` **repeatedly**, the cause is usually a
  long-running session caching a dead client registration in memory — **restart Claude Code** before
  touching `~/.claude/.credentials.json`. (Verified 2026-09-14.)
- **Sync before branching (every session).** Start with `git fetch origin --prune`, fast-forward
  local `main` (`git switch main && git pull --ff-only`), then cut new work from fresh upstream:
  `git switch -c b/foo origin/main` — never off a stale local `main`. GitHub auto-deletes merged
  head branches and `fetch.prune` is enabled, so after the fetch any local branch marked
  `[gone]` in `git branch -vv` is a merged leftover — delete it with `git branch -d` (safe: it
  refuses if not actually merged; squash-merged ones need `-D`).
- **Plan mode first** for any feature or refactor; get the plan approved before writing code.
- Stay in scope: do not change logic, signatures, or queries beyond the approved plan. Report
  exactly what changed.
- After any merge or pull of `main`, run the `verify-merge` skill before trusting the result.
- Use the `code-reviewer` subagent on the diff before declaring a feature done.
- Use the `db-verifier` subagent (read-only DB) to check data invariants after flows that touch
  balances or distributions.
- **Browser testing:** browser/Playwright flows always log in with the test account from
  `.env.test.local` (`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`) — never automate the owner's real
  account. Scope any `db-verifier` checks after a browser run to that test account's `user_id`.
- End every working session with the `wrapup` skill so `PROJECT-CONTEXT.md` stays current.
- Owner's machine is **Windows / PowerShell**: `Remove-Item -Recurse -Force` not `rm -rf`;
  commit with `git commit -m "..."`; LF→CRLF warnings are harmless.

## Key references (read on demand, don't preload)

- `PROJECT-CONTEXT.md` — master context: schema (§4), features (§5), **current status (§6 — the
  only place status is asserted)**, decision log (§7), gotchas (§8). Read §6–§7 at the start of any
  feature session.
- `OPEN-QUESTIONS.md` — decisions currently waiting on the owner.
- `PHASE-ROADMAP.md` — how to start work that has **not** started. Carries no status.
- `docs/plans/backup-restore-feature-plan.md`, `docs/plans/encryption-with-key-plan.md` — plans for
  phases **not yet built**.
- `docs/plans/` also holds the specs for shipped features that source code still cites:
  `budgeting-page-plan.md`, `pdf-import-plan.md`, `kbc-adapter-spec.md`,
  `kbc-csv-import-background.md`.
- `docs/archive/` — consumed plans, kept for their reasoning, **not** for instruction.
- `docs/audit/` — the 2026-09 audit that produced this structure (inventory, discrepancies,
  decisions, journal).
- `src/lib/distributeIncome.js`, `src/components/DistributionPopup.jsx` — the heart of the
  distribution system.

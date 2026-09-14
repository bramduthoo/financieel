# Financieel

A personal finance web app built around a **wallet** model — envelope budgeting, in euros, for one
household.

Income arrives and is distributed across wallets (fixed / variable / capped / investment, plus a
system **Unallocated** wallet that catches whatever is left over). Balances, recurring payments and
projections are tracked from there, and bank statements can be imported from KBC as PDF or monthly
CSV.

## Running it

```bash
npm install
npm run dev      # Vite dev server, http://localhost:5173
npm test         # Vitest — behaviour tests for the pure logic in src/lib/
npm run build    # production build
```

Needs a `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

**Stack:** React 19 + Vite 8, Tailwind CSS v4, React Router v7, Supabase (Postgres + Auth),
deployed on Vercel. Charts are inline SVG — no chart library.

## Reading order

This project keeps its context in a few deliberate places. In order:

| File | What it is |
|---|---|
| **`CLAUDE.md`** | The rules: commands, stack, the non-negotiables, the design system. Start here. |
| **`PROJECT-CONTEXT.md`** | The master context — schema (§4), features (§5), **current status (§6)**, and the decision log (§7) explaining *why* things are the way they are. |
| **`DESIGN-SPEC.md`** | The locked design language. All UI follows it. |
| **`PHASE-ROADMAP.md`** | How to start the work that has not started yet. |
| **`OPEN-QUESTIONS.md`** | Decisions currently waiting on the owner. |

`docs/plans/` holds the specification for each feature, `docs/archive/` keeps consumed plans for
their reasoning, and `docs/audit/` is the record of the 2026-09 audit that produced this structure.

**Status lives in `PROJECT-CONTEXT.md` §6 and nowhere else.** If another document appears to assert
what is or is not built, it is out of date.

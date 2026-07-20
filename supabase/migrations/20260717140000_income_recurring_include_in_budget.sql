-- Purpose: mark which recurring incomes participate in the Budgeting plan. The Budgeting page
--          (Phase B) lets the user select which recurring incomes are "included in the plan"; the
--          per-wallet budget-coverage check sums each included income's distribution to a wallet and
--          compares it to the wallet's budget. Persisting the flag lets the plan be remembered across
--          sessions and lets Phase C (planned-vs-used) know which incomes count.
-- Date:    2026-07-17
-- Feature: Budgeting Phase B — the Budgeting page (budgeting-page-plan.md §5).
-- Impact:  Adds one NOT NULL boolean column with DEFAULT true, so every existing recurring income is
--          included by default (no backfill needed, no behavioural change until the page writes it).
--          Existing RLS policies on income_recurring already cover this column. Rollback: DROP COLUMN.

ALTER TABLE public.income_recurring
  ADD COLUMN include_in_budget boolean NOT NULL DEFAULT true;

-- Purpose: enforce that a capped wallet's ceiling (cap_max) is never below its monthly
--          budget/inflow. A cap_max < budget makes the capped mechanic nonsensical — the wallet
--          would begin reducing income before it can even receive a full month's budget.
-- Date:    2026-07-17
-- Feature: Budgeting Phase A — capped-wallet mechanic (budgeting-page-plan.md §4).
--          Data-layer backstop for the cap_max >= budget rule that WalletModal already validates
--          UI-side; sibling to the existing wallets_cap_max_nonneg / wallets_overflow_not_self CHECKs.
-- Impact:  Adds one CHECK constraint to public.wallets. Non-capped wallets carry cap_max NULL and
--          pass trivially. Verified read-only on 2026-07-17: zero existing rows violate it
--          (no wallet has cap_max < budget). Adding a CHECK takes a brief ACCESS EXCLUSIVE lock
--          while Postgres validates the (tiny) table. Rollback: DROP the constraint — no data risk.

ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_cap_max_gte_budget
  CHECK (cap_max IS NULL OR budget IS NULL OR cap_max >= budget);

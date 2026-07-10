-- ============================================================================
-- Migration: reset_user_data(p_full boolean)
-- Date:      2026-07-09
-- Feature:   Settings page phase-1 hygiene (branch b/settings-hygiene), Task B.
-- Purpose:   Replace the client-side "delete all data" path (which illegally
--            wrote wallets.balance directly, violating the RPC-only-balance
--            rule) with ONE transactional, auth.uid()-scoped function offering
--            two tiers:
--              * p_full = false  -> "Clear activity": wipe transactions, income
--                entries, budget allocations, pending unallocated conflicts, and
--                reset every wallet balance to 0. Keeps templates/rules/plans.
--              * p_full = true   -> "Full reset": all of the above, PLUS the
--                distribution rules, recurring income/rules, income templates
--                (+items) and unallocated templates/plans (+items).
--            Both tiers ALWAYS keep: the wallets themselves (incl. Unallocated)
--            and the settings row.
--
-- Balances are reset INSIDE this SECURITY INVOKER function (never client-side),
-- satisfying non-negotiable rule #1. Every statement is scoped to auth.uid();
-- RLS delete/update policies enforce the same on top.
--
-- Impact:    No schema/table/column/policy changes. Adds one function. Does not
--            lock tables beyond the row locks of the DELETE/UPDATE it runs
--            within its own transaction. Rollback: DROP FUNCTION reset_user_data.
--
-- FK/delete order verified against live schema on 2026-07-09 (children first;
-- self-referential FKs are NO ACTION so a single per-table DELETE is safe).
-- ============================================================================

create or replace function public.reset_user_data(p_full boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'reset_user_data: no authenticated user (auth.uid() is null)';
  end if;

  -- ---- Tier: ALWAYS (both "clear activity" and "full reset") ---------------
  -- Activity + transient state. Children before parents.
  delete from public.transactions                 where user_id = v_uid;
  delete from public.unallocated_pending_conflicts where user_id = v_uid;
  delete from public.income_entries               where user_id = v_uid;
  delete from public.budget_allocations           where user_id = v_uid;

  -- Reset every wallet balance to 0 (incl. Unallocated). Wallets are KEPT.
  update public.wallets set balance = 0 where user_id = v_uid;

  -- ---- Tier: FULL RESET only ----------------------------------------------
  -- Structure/config: distribution rules, recurring income/rules, templates,
  -- unallocated templates & plans (+ item tables). Children before parents.
  if p_full then
    delete from public.income_distribution_rules          where user_id = v_uid;
    delete from public.income_recurring                   where user_id = v_uid;
    delete from public.income_template_distribution_items where user_id = v_uid;
    delete from public.income_templates                   where user_id = v_uid;
    delete from public.recurring_rules                    where user_id = v_uid;
    delete from public.unallocated_plan_items             where user_id = v_uid;
    delete from public.unallocated_plans                  where user_id = v_uid;
    delete from public.unallocated_template_items         where user_id = v_uid;
    delete from public.unallocated_templates              where user_id = v_uid;
  end if;
end;
$$;

comment on function public.reset_user_data(boolean) is
  'Settings danger zone. p_full=false clears activity (transactions, income entries, budget allocations, pending conflicts) and zeroes wallet balances; p_full=true additionally removes distribution rules, recurring income/rules, income templates (+items) and unallocated templates/plans (+items). Scoped to auth.uid(); keeps wallets and settings. See b/settings-hygiene Task B.';

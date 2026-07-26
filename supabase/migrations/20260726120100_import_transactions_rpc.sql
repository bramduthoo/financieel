-- Purpose: import_transactions(p_items jsonb) — the transactional commit path for a batch of
--          imported bank transactions. Inserts the transaction rows, adjusts wallet balances
--          INSIDE the function, and upserts the learned counterparty→wallet mappings.
-- Date:    2026-07-26
-- Feature: PDF transaction import (pdf-import-plan.md §8).
-- Impact:  Creates one function. No schema/data change on its own. Depends on
--          20260726120000_import_schema.sql (import_fingerprint column +
--          counterparty_wallet_mappings table) — apply that first.
-- Rollback: DROP FUNCTION public.import_transactions(jsonb);
--
-- Design notes (the invariants this exists to protect):
--  * SECURITY INVOKER (the default) + search_path='' — the caller's RLS applies, exactly the
--    edit_income_distribution / reset_user_data mould. Every object is schema-qualified.
--  * ALL-OR-NOTHING. A function body is one transaction: every item is validated BEFORE any
--    row is written, so a bad wallet_id in item 7 cannot leave items 1-6 committed.
--  * Balance changes happen HERE, never in client code. The frontend only calls
--    supabase.rpc('import_transactions', …) — it performs no balance math of its own.
--  * NO CAP LOGIC. Capped-wallet behaviour belongs to income distribution only; an imported
--    debit is a plain spend. This is deliberate — do not "fix" it by adding cap handling.
--  * Credits reaching this function are REFUND credits only. Income-type credits go through
--    the existing income path (income_entries + DistributionPopup), never through here.

CREATE OR REPLACE FUNCTION public.import_transactions(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
declare
  v_uid        uuid := auth.uid();
  v_item       jsonb;
  v_wallet_id  uuid;
  v_amount     numeric;
  v_direction  text;
  v_date       date;
  v_key        text;
  v_debits     integer := 0;
  v_credits    integer := 0;
begin
  if v_uid is null then
    raise exception 'import_transactions: no authenticated user (auth.uid() is null)';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'import_transactions: no items provided';
  end if;

  -- ── Pass 1: validate everything before mutating anything ────────────────────
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_wallet_id := (v_item->>'wallet_id')::uuid;
    v_amount    := (v_item->>'amount')::numeric;
    v_direction := v_item->>'direction';
    v_date      := (v_item->>'date')::date;

    if v_wallet_id is null then
      raise exception 'import_transactions: every item needs a wallet_id';
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'import_transactions: amount must be positive (got %)', v_amount;
    end if;

    if v_direction is null or v_direction not in ('debit', 'credit') then
      raise exception 'import_transactions: direction must be debit or credit (got %)', v_direction;
    end if;

    if v_date is null then
      raise exception 'import_transactions: every item needs a date';
    end if;

    if not exists (
      select 1 from public.wallets
      where id = v_wallet_id and user_id = v_uid
    ) then
      raise exception 'import_transactions: wallet % not found or not owned by caller', v_wallet_id;
    end if;
  end loop;

  -- ── Pass 2: write ───────────────────────────────────────────────────────────
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_wallet_id := (v_item->>'wallet_id')::uuid;
    v_amount    := (v_item->>'amount')::numeric;
    v_direction := v_item->>'direction';
    v_date      := (v_item->>'date')::date;
    v_key       := nullif(btrim(coalesce(v_item->>'counterparty_key', '')), '');

    insert into public.transactions
      (wallet_id, type, amount, date, note, is_confirmed, completed_at,
       import_fingerprint, user_id)
    values
      (v_wallet_id, v_direction, v_amount, v_date, v_item->>'note', true, now(),
       nullif(v_item->>'fingerprint', ''), v_uid);

    update public.wallets
      set balance = balance + case when v_direction = 'debit' then -v_amount else v_amount end
      where id = v_wallet_id and user_id = v_uid;

    if v_direction = 'debit' then
      v_debits := v_debits + 1;
    else
      v_credits := v_credits + 1;
    end if;

    -- Learn the mapping so the next import pre-fills this counterparty. Re-confirming to a
    -- different wallet MOVES the mapping — the newest confirmation is the best signal.
    if v_key is not null then
      insert into public.counterparty_wallet_mappings as m
        (counterparty_key, wallet_id, times_confirmed, last_confirmed_at, user_id)
      values
        (v_key, v_wallet_id, 1, now(), v_uid)
      on conflict (user_id, counterparty_key) do update
        set wallet_id         = excluded.wallet_id,
            times_confirmed   = m.times_confirmed + 1,
            last_confirmed_at = now();
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_debits + v_credits,
    'debits',   v_debits,
    'credits',  v_credits
  );
end;
$function$;

COMMENT ON FUNCTION public.import_transactions(jsonb) IS
  'Transactional commit path for imported bank transactions (pdf-import-plan.md §8). '
  'Validates every item against auth.uid() before writing anything, then inserts the '
  'transaction rows, adjusts wallet balances inside the function, and upserts the learned '
  'counterparty->wallet mappings. All-or-nothing. No cap logic: an imported debit is a plain '
  'spend. Income-type credits do NOT come through here — they use the existing income path.';

-- Purpose: Schema for the KBC monthly CSV import — the persistent learned link between a
--          recurring rule and an imported counterparty (so a verified recurring row is
--          recognised silently from the second month on, instead of being double-counted),
--          and the month-boundary balance snapshots that let the app detect drift from the
--          real bank account.
-- Date:    2026-07-30
-- Feature: KBC monthly CSV import (kbc-csv-import-background.md §3 + §4).
-- Impact:  Creates 2 new tables with RLS + the standard four {table}_{cmd}_own policies, and
--          2 unique indexes. Purely additive: no existing table, column, policy or function is
--          read, rewritten or dropped, so every current code path keeps working untouched.
--          CREATE TABLE takes no lock on anything that exists; the indexes are created on the
--          new (empty) tables, so index builds are instant and non-concurrent is fine.
-- Rollback: DROP TABLE public.recurring_import_links, public.monthly_balance_snapshots;
--          (the indexes and policies go with them). No data loss beyond the feature's own data.
-- NOTE:    NO balance logic lives here. Imported money still moves only through the existing
--          import_transactions RPC; these two tables hold a preference and a measurement.
-- NOTE:    `user_id` is NOT NULL here, unlike the older user-data tables which left it nullable.
--          Both new tables carry a UNIQUE index that includes user_id, and Postgres treats NULLs
--          as distinct — a NULL user_id would silently bypass "one link per counterparty" and
--          "one snapshot per boundary". The RLS INSERT policy already requires user_id =
--          auth.uid(), so NOT NULL only closes the door that policy leaves shut anyway. Say so if
--          you'd rather match the older tables exactly.
-- OPEN Q:  reset_user_data(p_full) was checked against the live DB and does not touch the
--          PDF-import tables either (counterparty_wallet_mappings, imported_statements) — a
--          pre-existing gap, deliberately not changed here. For the new tables: a FULL reset
--          deletes income_recurring + recurring_rules, so recurring_import_links disappears
--          with them via ON DELETE CASCADE. monthly_balance_snapshots would SURVIVE a full
--          reset. Owner's call whether a full reset should also clear the snapshots (and the
--          two older import tables); if yes, that is a separate CREATE OR REPLACE FUNCTION
--          migration, not this one.

-- ── 1. Recurring-rule ↔ import link ────────────────────────────────────────────────────
-- Why a table rather than a column on the rule tables: (a) neither income_recurring nor
-- recurring_rules stores a counterparty; (b) the link's amount must be able to DIVERGE from
-- the rule's amount — "yes it's my rent, but don't change the rule" is one of the three
-- answers the deviation flow offers; (c) the app versions a rule when its amount changes
-- (end-date + insert with parent_rule_id), which would strand a column on the archived row.
--
-- The app has TWO separate recurring tables, so the link carries a discriminator plus two
-- nullable FKs, with a CHECK that exactly one is set and matches the discriminator.
CREATE TABLE IF NOT EXISTS public.recurring_import_links (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_kind           text        NOT NULL CHECK (rule_kind IN ('income', 'expense')),
  income_recurring_id uuid        REFERENCES public.income_recurring(id) ON DELETE CASCADE,
  recurring_rule_id   uuid        REFERENCES public.recurring_rules(id) ON DELETE CASCADE,
  counterparty_key    text        NOT NULL,
  direction           text        NOT NULL CHECK (direction IN ('debit', 'credit')),
  linked_amount       numeric     NOT NULL,
  account_iban        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  -- NOT NULL, unlike the older user-data tables (see the header note): both unique indexes below
  -- treat NULL as distinct, so a NULL user_id would slip past the one-link-per-counterparty rule.
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  CONSTRAINT recurring_import_links_one_rule CHECK (
    (rule_kind = 'income'  AND income_recurring_id IS NOT NULL AND recurring_rule_id IS NULL)
    OR
    (rule_kind = 'expense' AND recurring_rule_id   IS NOT NULL AND income_recurring_id IS NULL)
  )
);

-- The upsert target: one link per counterparty per direction per user. Re-confirming a
-- counterparty to a different rule MOVES the link instead of creating a competing one — two
-- links on one counterparty would make the matcher ambiguous, and an ambiguous match is how a
-- real transaction gets silently dropped.
CREATE UNIQUE INDEX IF NOT EXISTS recurring_import_links_user_key_uniq
  ON public.recurring_import_links (user_id, counterparty_key, direction);

ALTER TABLE public.recurring_import_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurring_import_links_select_own ON public.recurring_import_links;
CREATE POLICY recurring_import_links_select_own ON public.recurring_import_links
  FOR SELECT TO public USING (user_id = auth.uid());

DROP POLICY IF EXISTS recurring_import_links_insert_own ON public.recurring_import_links;
CREATE POLICY recurring_import_links_insert_own ON public.recurring_import_links
  FOR INSERT TO public WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS recurring_import_links_update_own ON public.recurring_import_links;
CREATE POLICY recurring_import_links_update_own ON public.recurring_import_links
  FOR UPDATE TO public USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS recurring_import_links_delete_own ON public.recurring_import_links;
CREATE POLICY recurring_import_links_delete_own ON public.recurring_import_links
  FOR DELETE TO public USING (user_id = auth.uid());

-- ── 2. Month-boundary balance snapshots ────────────────────────────────────────────────
-- One row per (account, month boundary). A boundary is the 1st at 00:00, which is at once the
-- END of the previous month and the START of the next — that shared key is what makes drift
-- detectable: December's import writes 2026-01-01 from its closing balance, January's import
-- writes 2026-01-01 from its opening balance, and a disagreement means the app's picture of
-- the account has drifted from the bank's.
--
-- account_iban is stored PLAIN, matching transactions.import_fingerprint (which already
-- embeds the IBAN) rather than imported_statements' hash: it is compared and displayed, and it
-- reveals nothing that fingerprint doesn't, behind the same RLS.
CREATE TABLE IF NOT EXISTS public.monthly_balance_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_iban  text        NOT NULL,
  boundary_date date        NOT NULL,
  balance       numeric     NOT NULL,
  source        text        NOT NULL DEFAULT 'kbc_csv',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- A snapshot that is not on a month boundary is a bug, not data: reject it at the door.
  CONSTRAINT monthly_balance_snapshots_is_boundary
    CHECK (EXTRACT(DAY FROM boundary_date) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_balance_snapshots_user_account_boundary_uniq
  ON public.monthly_balance_snapshots (user_id, account_iban, boundary_date);

ALTER TABLE public.monthly_balance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monthly_balance_snapshots_select_own ON public.monthly_balance_snapshots;
CREATE POLICY monthly_balance_snapshots_select_own ON public.monthly_balance_snapshots
  FOR SELECT TO public USING (user_id = auth.uid());

DROP POLICY IF EXISTS monthly_balance_snapshots_insert_own ON public.monthly_balance_snapshots;
CREATE POLICY monthly_balance_snapshots_insert_own ON public.monthly_balance_snapshots
  FOR INSERT TO public WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS monthly_balance_snapshots_update_own ON public.monthly_balance_snapshots;
CREATE POLICY monthly_balance_snapshots_update_own ON public.monthly_balance_snapshots
  FOR UPDATE TO public USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS monthly_balance_snapshots_delete_own ON public.monthly_balance_snapshots;
CREATE POLICY monthly_balance_snapshots_delete_own ON public.monthly_balance_snapshots
  FOR DELETE TO public USING (user_id = auth.uid());

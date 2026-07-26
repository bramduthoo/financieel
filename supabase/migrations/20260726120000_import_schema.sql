-- Purpose: Schema for the PDF bank-statement import feature — the bank preference, the
--          per-transaction dedupe fingerprint, the learned counterparty→wallet mappings that
--          make the feature feel automatic from the second import onward, and a generic
--          imported-statements ledger.
-- Date:    2026-07-26
-- Feature: PDF transaction import (pdf-import-plan.md §9, kbc-adapter-spec.md).
-- Impact:  Adds 1 nullable column + CHECK to public.settings, 1 nullable column + partial
--          index to public.transactions, and creates 2 new tables with RLS + the standard
--          four {table}_{cmd}_own policies. All additive: no existing row is read or
--          rewritten, no column is dropped or retyped, every new column is nullable so
--          existing rows and all current INSERT paths keep working untouched. ALTER TABLE
--          ADD COLUMN with no default is metadata-only in Postgres (no table rewrite); the
--          brief ACCESS EXCLUSIVE lock is negligible on tables this size (41 transaction
--          rows, 2 settings rows). CREATE INDEX is non-concurrent for the same reason.
-- Rollback: DROP the two tables, DROP the index, DROP the two columns (and the settings
--          CHECK constraint). No data loss beyond the feature's own data.
-- NOTE:    transactions.import_fingerprint is deliberately NOT unique. Two genuinely
--          identical same-day purchases exist; duplicates are FLAGGED in the preview and
--          default to skipped, but the user can knowingly override. A unique index would
--          turn that legitimate case into a hard failure.

-- ── 1. Bank preference (default/tiebreaker only; the PDF itself is the router) ──────────
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS bank_provider text;

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_bank_provider_supported;

ALTER TABLE public.settings
  ADD CONSTRAINT settings_bank_provider_supported
  CHECK (bank_provider IS NULL OR bank_provider IN ('kbc'));

-- ── 2. Per-transaction dedupe fingerprint ──────────────────────────────────────────────
-- Composite key: '<own iban>|<date>|<amount>|<direction>|<counterparty key>'. Also marks a
-- row as imported rather than hand-entered.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS import_fingerprint text;

CREATE INDEX IF NOT EXISTS transactions_import_fingerprint_idx
  ON public.transactions (user_id, import_fingerprint)
  WHERE import_fingerprint IS NOT NULL;

-- ── 3. Learned counterparty → wallet mappings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.counterparty_wallet_mappings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_key text        NOT NULL,
  wallet_id        uuid        NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  times_confirmed  integer     NOT NULL DEFAULT 1,
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  user_id          uuid        REFERENCES auth.users(id) ON DELETE CASCADE
);

-- The upsert target: one mapping per counterparty per user. Re-confirming a counterparty
-- to a different wallet moves the mapping rather than creating a competing one.
CREATE UNIQUE INDEX IF NOT EXISTS counterparty_wallet_mappings_user_key_uniq
  ON public.counterparty_wallet_mappings (user_id, counterparty_key);

ALTER TABLE public.counterparty_wallet_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS counterparty_wallet_mappings_select_own ON public.counterparty_wallet_mappings;
CREATE POLICY counterparty_wallet_mappings_select_own ON public.counterparty_wallet_mappings
  FOR SELECT TO public USING (user_id = auth.uid());

DROP POLICY IF EXISTS counterparty_wallet_mappings_insert_own ON public.counterparty_wallet_mappings;
CREATE POLICY counterparty_wallet_mappings_insert_own ON public.counterparty_wallet_mappings
  FOR INSERT TO public WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS counterparty_wallet_mappings_update_own ON public.counterparty_wallet_mappings;
CREATE POLICY counterparty_wallet_mappings_update_own ON public.counterparty_wallet_mappings
  FOR UPDATE TO public USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS counterparty_wallet_mappings_delete_own ON public.counterparty_wallet_mappings;
CREATE POLICY counterparty_wallet_mappings_delete_own ON public.counterparty_wallet_mappings
  FOR DELETE TO public USING (user_id = auth.uid());

-- ── 4. Imported-statement ledger (generic; NOT written by the KBC v1 path) ─────────────
-- The KBC "Export KBC Mobile" format is a per-transaction export with no volgnummer and no
-- balances, so document-level dedupe has nothing to key on and this table stays empty in
-- v1. It exists for a future classic-uittreksel adapter, which does carry a statement
-- number. Flagged as such rather than silently written with placeholder rows.
CREATE TABLE IF NOT EXISTS public.imported_statements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank              text        NOT NULL,
  account_iban_hash text,
  statement_number  text,
  imported_at       timestamptz NOT NULL DEFAULT now(),
  user_id           uuid        REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.imported_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imported_statements_select_own ON public.imported_statements;
CREATE POLICY imported_statements_select_own ON public.imported_statements
  FOR SELECT TO public USING (user_id = auth.uid());

DROP POLICY IF EXISTS imported_statements_insert_own ON public.imported_statements;
CREATE POLICY imported_statements_insert_own ON public.imported_statements
  FOR INSERT TO public WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS imported_statements_update_own ON public.imported_statements;
CREATE POLICY imported_statements_update_own ON public.imported_statements
  FOR UPDATE TO public USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS imported_statements_delete_own ON public.imported_statements;
CREATE POLICY imported_statements_delete_own ON public.imported_statements
  FOR DELETE TO public USING (user_id = auth.uid());

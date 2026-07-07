---
name: db-migration
description: Schema-change discipline for the financieel Supabase database. MUST be used for ANY change to tables, columns, RLS policies, triggers, or Postgres functions — including "small" ones like adding a column or index. Also use when asked to "add a field", "create a table", "write an RPC", or anything that alters the DB. Never write ad-hoc DDL outside this procedure.
---

# DB Migration Procedure

Historical context: this project once *assumed* a migration had run when it silently hadn't,
breaking user isolation. There are also no historical migration files in the repo — the live DB
is the only source of truth for existing schema. This procedure fixes both problems going
forward.

## 0. Read before you write

Query the **live** schema for every table/function you'll touch, via the read-only Supabase
MCP (`list_tables`, `execute_sql` against `information_schema` / `pg_policies` /
`pg_proc`). Never trust ARCHITECTURE.md, Cursus/, or memory. Confirm current state matches
your assumption; if it doesn't, stop and report.

## 1. Draft the migration as a file in the repo

Write the SQL to `supabase/migrations/YYYYMMDDHHMMSS_short_name.sql` (create the folder if it
doesn't exist). Requirements:

- New user-data tables: nullable `user_id uuid` FK to `auth.users(id) ON DELETE CASCADE`,
  RLS enabled, four policies named `{table}_{cmd}_own` (select/insert/update/delete, role
  `public`, `user_id = auth.uid()`).
- Balance-touching logic goes in a transactional Postgres function (SECURITY INVOKER), not
  client code.
- Idempotent where reasonable (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- Include a comment block: purpose, date, related feature/plan file.

## 2. Present and wait

Show the owner the full SQL plus a one-paragraph impact summary (tables affected, whether it
locks, rollback approach). **Do not apply anything. Wait for explicit approval.**

## 3. Apply — owner's channel

Claude Code's DB access is read-only by design. Application happens via the owner: either the
chat assistant's write connector, or the Supabase SQL Editor, pasting the migration file
verbatim. Ask the owner to confirm when it has been applied.

## 4. Verify it actually ran

Re-query the live schema (columns, policies, function signatures) and assert the change exists
exactly as drafted. This step is mandatory — a migration is not done until verified against the
live DB. If testing a SECURITY INVOKER function: `auth.uid()` is null outside an app session;
test by setting `request.jwt.claims` to a real user id inside a `DO $$ ... $$` block, assert,
and **clean up all test data**.

## 5. Record

- Commit the migration file on the current feature branch.
- Update `PROJECT-CONTEXT.md` §4 (schema) with the change.

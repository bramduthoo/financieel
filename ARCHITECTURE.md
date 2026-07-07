# ARCHITECTURE.md — RETIRED

> **This file is retired as a source of truth.** Its former contents described a single-user app
> with a schema that predates the multi-user, distribution-redesign, and Unallocated-outbound work,
> and they were wrong in ways that caused real incidents when trusted. Do **not** rely on anything
> that used to be here.

## Where the truth actually lives

Ground-truth order (highest wins):

1. **The live Supabase database** — the only complete source of truth for schema (there are no SQL
   migration files in the repo; migrations were applied by hand). Read it before assuming anything.
2. **`PROJECT-CONTEXT.md`** — master context: schema (§4), features (§5), current standing (§6),
   decision log (§7), gotchas (§8).
3. **`CLAUDE.md`** — always-loaded project rules, commands, stack, design system, hooks.

Phase/feature plans: `distribution-unallocated-plan.md`, `testing-setup-plan.md`,
`backup-restore-feature-plan.md`, `encryption-with-key-plan.md`.

_Kept as a stub (not deleted) so old links/bookmarks land here and get redirected instead of 404ing._

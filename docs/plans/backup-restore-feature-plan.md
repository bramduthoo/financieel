# Backup and restore (export/import) feature plan for Financieel

Handoff note to kickstart building a local data backup and restore feature.
Feed this back into a conversation to resume the topic.

## Why this feature

Two reasons, one standalone and one strategic.

Standalone value: users get data portability and disaster recovery. If their
account is lost, corrupted, or deleted, they can rebuild it from a file they
control. This is useful even in the current unencrypted app.

Strategic value: this feature is the prerequisite that makes full client-side
encryption safe for real users. Password-derived encryption means a forgotten
password equals permanently unrecoverable data (not even the admin can
recover it). A periodic local backup converts that from "lose password, lose
everything" into "lose password AND your backups, lose everything," a risk
the user controls. Build this BEFORE or ALONGSIDE encryption, never after.

## What it does

1. Export
   A button/flow that gathers all of the current user's data (wallets,
   transactions, recurring rules, income entries, income recurring, income
   templates, distribution rules, budget allocations, settings) and writes it
   to a downloadable file the user saves locally.

   Format: JSON. Structured enough to fully reconstruct the account, compact
   enough to stay small. Consider including a schema version field so future
   imports can handle older backup formats.

   If encryption is in place: the export happens in the browser while the user
   is logged in and the key is available, so the exported file contains
   DECRYPTED, readable data (the user's own data, on their own machine, is
   theirs to hold in clear form). This is exactly what makes it a usable
   recovery file.

2. Import / restore
   A flow where a user (typically a freshly re-registered account after losing
   access) uploads their backup file, and the app recreates all their data:
   inserts the wallets, transactions, rules, etc., tagged with the new
   account's user_id. If encryption is in place, the data is re-encrypted with
   the new account's key on the way in.

3. Reminders
   Prompt the user to export periodically: every month, or every N transactions
   (e.g. 50), or on some sensible trigger. Keep it gentle and dismissable, not
   nagging. The goal is that an active user always has a reasonably recent
   backup.

## Design considerations to resolve when building

- Exactly which tables and fields go in the export, and in what structure.
  Preserve relationships (a transaction references a wallet) so import can
  rebuild them. Since IDs change on reimport (new account), the import logic
  must remap old wallet IDs to newly created ones.
- The Unallocated wallet and settings row are auto-created by the signup
  trigger. Import must reconcile with these (update rather than duplicate).
- Validation on import: reject malformed files, handle version mismatches,
  give clear errors.
- A confirmation step on import if the account already has data, so a restore
  does not silently clobber existing data.
- Where in the UI this lives (Settings page is the natural home).

## Sequencing

- Can be built independently of encryption, on the current app, and adds value
  immediately.
- MUST exist before encryption is trusted with real user data.
- Tests should cover export-then-import round trips (export an account, import
  into a fresh one, confirm the data matches).

## What to do when resuming this topic

1. Confirm the current schema (tables and fields may have evolved).
2. Decide the export JSON structure, including ID remapping strategy for import.
3. Write Claude Code instructions to:
   - Add an export function that gathers all user data and triggers a file
     download (JSON).
   - Add an import function that parses a backup file, validates it, and
     recreates the data under the current user, remapping IDs and reconciling
     the auto-created Unallocated wallet and settings row.
   - Add UI in Settings for both, plus a gentle periodic reminder to export.
4. Test a full round trip locally before merging.

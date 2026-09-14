# Client-side encryption plan for Financieel

Handoff note to kickstart adding client-side encryption so that not even the
database admin can read users' sensitive financial data. Feed this back into a
conversation to resume the topic.

PREREQUISITES BEFORE STARTING:
- The testing infrastructure (Vitest + CI) should exist first. Encryption logic
  fails silently (it corrupts or exposes rather than crashing), so unit tests
  around it are essential before trusting it with real data.
- The backup/restore feature should exist first or be built alongside, because
  password-derived encryption means a forgotten password equals permanently
  unrecoverable data. The local backup is the safety net that makes this humane.

## The core principle (do not violate)

The encryption key is derived from the user's password, in the browser, and
NEVER touches the server. Not stored in the database, not transmitted, not
logged. The entire security of the scheme rests on this single discipline. If
the key is ever persisted server-side, the admin can read data again and the
whole feature becomes theatre.

## How the key works (important conceptual points)

- The key is the SAME every session, not new each time. Data encrypted once can
  only be decrypted with the same key.
- "Fresh every session" means the key is RE-DERIVED each session from the
  password, not that it changes. Key derivation is deterministic: same password
  + same salt always yields the same key.
- The key lives only in browser memory while the user is logged in. Closing the
  tab clears it. Next login re-derives the identical key from the password.

## The salt

- Each user gets a random salt, generated once at signup, stored in the
  database (the salt is NOT secret, plaintext storage is fine and standard).
- Key = derive(password + salt). The salt ensures two users with the same
  password get different keys, and defeats precomputation attacks.
- At login: fetch the user's salt, combine with the typed password, derive the
  key. Same salt + same password = identical key every time.

## Tools (all free, no third party)

- Web Crypto API, built into every browser. Provides AES-GCM encryption and
  PBKDF2 key derivation. No installation, no subscription, no external service.
- Optionally libsodium.js (free, open source) for a friendlier interface over
  the same primitives.
- Deliberately do NOT use a server-side key management service (e.g. AWS KMS):
  it would reintroduce a third party who could access keys, defeating the goal.

## Which fields to encrypt

Encrypt the SENSITIVE values: amounts, balances, wallet names, notes,
descriptions, anything revealing a user's financial situation.

Keep PLAINTEXT the structural fields the database still needs to function:
IDs, user_id, dates, types (fixed/variable/etc.), is_system flags, sort_order,
foreign keys. The database needs these to enforce RLS, sort, filter, and
maintain relationships.

## Architectural costs to accept (understand these before committing)

1. Loss of database-side atomicity on balance updates.
   Today, increment_wallet_balance / decrement_wallet_balance run inside the
   database and are atomic (indivisible read-compute-write), preventing race
   conditions where simultaneous writes corrupt a balance. With encryption, the
   math moves to the browser (decrypt, compute, re-encrypt, write), and the
   database can no longer enforce atomicity across those steps. Practical risk
   at this scale is low (requires two writes to the same wallet within
   milliseconds, which a single user essentially never does), but it is a real
   downgrade from a provable guarantee to a probabilistic one. Mitigable with
   optimistic locking (version numbers on rows) if desired, at extra complexity.

2. No database-side computation/filtering/sorting on encrypted fields.
   The database cannot sum, compare, sort, or filter ciphertext. Any feature
   needing the database to operate on a sensitive value must move that work to
   the browser (fetch rows, decrypt, compute). For this app's scale (hundreds
   to low thousands of rows per user) browser-side processing is fast and
   imperceptible. Only becomes a performance concern at tens of thousands of
   rows loaded at once, which this app will not reach (Supabase free-tier
   bandwidth limits cap usage long before then).

3. Balance math and aggregations move from SQL into JavaScript.
   distributeIncome and dashboardCalcs are already mostly JS, so this is
   manageable, but the SQL balance functions and any SQL aggregations must be
   reimplemented in the browser layer.

No user-facing FEATURE becomes impossible. The limitations are internal
(concurrency robustness, location of computation), not visible to users.

## Special case: changing password

Changing the password changes the derived key, so all of the user's data must
be re-encrypted with the new key. This is a delicate migration: decrypt
everything with the old key (still derivable from the old password during the
change flow), re-encrypt with the new key, write back. Must be handled
carefully and tested thoroughly. The backup feature is a safety net here too.

## Rough scope (substantial, comparable to or larger than the multi-user work)

- Design which fields are encrypted vs plaintext.
- Salt generation at signup, salt storage, salt fetch at login.
- Key derivation on login (Web Crypto API, PBKDF2), key held in memory only.
- An encryption layer every insert/update passes through.
- A decryption layer every read passes through.
- Move balance math and aggregations from SQL into JavaScript.
- Handle the password-change re-encryption migration.
- Extensive tests (this is why testing comes first).

## What to do when resuming this topic

1. Confirm testing infrastructure exists and the backup/restore feature exists.
2. Confirm current schema and which fields will be encrypted vs plaintext.
3. Design the salt storage (a column on a user-scoped table, or a dedicated
   table) and the key-derivation parameters (algorithm, iterations).
4. Write Claude Code instructions in careful stages, NOT all at once:
   - Stage 1: salt at signup, key derivation on login, key held in memory.
     Test thoroughly before proceeding.
   - Stage 2: encrypt/decrypt layer on one table end to end (e.g. wallets),
     verify the dashboard shows ciphertext, the app shows real data. Test.
   - Stage 3: extend to remaining tables.
   - Stage 4: move balance math and aggregations to the browser. Test heavily.
   - Stage 5: password-change re-encryption flow. Test heavily.
5. At every stage, verify in the Supabase dashboard that sensitive fields show
   only ciphertext, confirming the admin genuinely cannot read them.

## OPEN DISCUSSIONS REQUIRED BEFORE BUILDING (added note)

Before any implementation of encryption begins, two topics must be discussed
and resolved first, not glossed over:

1. Atomicity and race conditions (revisit and decide).
   - Re-discuss the consequences of losing database-side atomic balance
     updates in concrete terms: what exactly can go wrong, how likely at this
     app's scale, what the worst case is.
   - Investigate whether race conditions can be PREVENTED rather than merely
     tolerated. Options to evaluate: optimistic locking (a version column on
     wallet rows that causes a conflicting write to fail and retry rather than
     silently overwrite); serialising balance writes client-side; keeping the
     balance itself unencrypted while encrypting other fields (evaluate whether
     a bare balance number, with no name or context, leaks enough to matter);
     or other patterns. Decide on an approach BEFORE building, do not discover
     the problem mid-implementation.

2. Loss of database-side filtering and sorting on encrypted fields (map impact).
   - Enumerate every EXISTING feature that relies on the database to sort,
     filter, compare, or compute on a field that would become encrypted
     (e.g. dashboard aggregations, any sorting by amount, any "over budget"
     comparisons, payment history ordering by amount, etc.). For each, decide
     how it moves to the browser and confirm it still works.
   - Enumerate POTENTIAL future features that might need database-side
     computation on sensitive fields, and judge whether encryption forecloses
     anything we care about.
   - For each impacted area, identify whether there is a clean fix (move
     computation to the browser) or a genuine limitation, and decide if the
     tradeoff is acceptable.

Only after both discussions reach a clear decision should implementation be
scoped and staged.

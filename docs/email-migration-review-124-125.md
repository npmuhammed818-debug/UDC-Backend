# Email-auth SQL migration review for #124 + #125

The exact #125 file `lib/db/migrations/20261023_email_authentication.sql` is unchanged.
All execution in this review used isolated loopback PostgreSQL, never Supabase or
production. This is evidence for review, not authorization to run a migration.

## Security and privileges

The new challenges/limits tables enable RLS, revoke PUBLIC/anon/authenticated table
grants, and create no client-facing policies. Both client roles were denied direct
reads. Deliberately reintroducing SELECT/INSERT grants in the disposable database
still returned zero rows on reads and rejected insertion through RLS. These fault
injection grants were removed afterward. Runtime code stores only keyed code hashes;
service-level tests additionally cover expiry, bounded guesses, single use and no
code leakage. The migration alone does not enforce these application rules.

A representative NOLOGIN BYPASSRLS `service_role` can perform backend operations.
It is a trusted server principal, never a client credential. **GRANT ALL also grants
TRUNCATE/TRIGGER/REFERENCES**, beyond current SELECT/INSERT/UPDATE/DELETE needs.
Narrowing should be explicitly reviewed before production; this temporary branch
keeps #125's migration unchanged so the reviewed input is faithfully exercised.
Verify the actual connection principal and existing inherited/column privileges;
these synthetic-role checks do not prove an existing production project's grants.
The owner can bypass RLS by design; FORCE RLS is not enabled.

The email-change trigger is SECURITY INVOKER (no definer privilege escalation), has
an explicit `pg_catalog, public` search path and uses schema-qualified objects.
It clears ownership and consumes outstanding challenges on changed email, without
changing business status or enabling recovery. Old and new writers need appropriate
backend permissions on the protected challenge table. Do not grant client access
as a workaround if the actual backend role is not the owner/trusted service role.

## Backward compatibility and data preservation

A disposable child database starts with the pre-email users schema and the actual
old authentication migration. It seeds 1,000 fictional legacy profiles with scrypt
hashes, mixed buyer/seller/agent roles/statuses, and an existing session. Checksums
of original profile fields and session payloads match before/after migration.
New proof fields remain null and recovery eligibility false; hashes are never used
to infer user-selected passwords. Old insert/update column lists continue working.
A second execution preserves profile/session payloads and validates idempotency.

No users-heap rewrite was observed on local PostgreSQL 17.11, consistent with a
constant false default and nullable additions. Idle execution was about 7 ms in
one local run. **This is not a production downtime or latency estimate**: actual
version, table size, traffic, concurrent DDL, privileges and connection pools differ.
Migration adds columns/tables/indexes/trigger; it does not drop or backfill existing
business records. Old application versions can continue writing existing columns;
proof invalidation remains active once the trigger is installed.

## Locking, potential downtime and rollback

`ALTER TABLE users` requires ACCESS EXCLUSIVE even for additive/IF NOT EXISTS DDL.
The transaction holds locks until COMMIT; a waiting DDL lock can queue later traffic.
Foreign-key/trigger operations also interact with the users relation. The SQL has
**no lock_timeout or statement_timeout**; it can wait indefinitely on long readers
or writers and must not be described as inherently zero downtime or blindly rerun.

The fixture holds a legacy reader open, observes the migration's ungranted ACCESS
EXCLUSIVE lock in `pg_locks`, then gets SQLSTATE 55P03 using a two-second session
lock budget. ROLLBACK leaves no new columns/tables and preserves profile/session
checksums. After releasing the reader, exact migration application succeeds.
A second fault-injection case provides an incompatible sentinel table so the exact
migration fails after the users ALTER statements. Transaction rollback removes those
new columns while retaining the sentinel and all legacy payloads. This also checks
that unexpected existing schema is rejected rather than silently overwritten.
No connection termination, production lock, or real customer traffic was involved.

Before a separately approved production execution:

1. Review actual schema/version/privileges and the exact SQL; take the normal
   approved backup/recovery precautions and choose a low-traffic maintenance window.
2. Set connection-level lock and statement budgets (for example 2 s and 15 s,
   subject to owner/DBA review); fail/rollback on contention and investigate before
   retrying. These were test settings only, not production configuration changes.
3. Verify newly applied columns, RLS/grants, trigger and legacy record counts; deploy
   compatible code only through the approved release process. Schema is additive,
   so prefer retaining it if rolling application code back; do not automatically
   drop tables/columns or discard issued challenges/verification data.
4. Keep real mail disabled until provider/sender, proxy/IP behavior, existing strong
   session-secret readiness and legacy enrollment are reviewed and approved.

`drizzle push` alone is insufficient because it does not install the SQL trigger
or privilege/RLS changes. Production role and Supabase TLS compatibility are separate
acceptance gates; PR #123 remains entirely outside this integration.

## Reproduction

`UDC_MIGRATION_QA_DATABASE_URL=<isolated-loopback-udc_qa_migration_database> node artifacts/api-server/test/integration/email-migration-review.mjs`

The runner refuses remote hosts/host overrides/non-QA database names, creates and
cleans only its own randomly named child DB, and creates/drops only missing fixture
roles in the isolated test cluster. It does not alter existing role attributes.
CI runs it in a separate ephemeral PostgreSQL service and uploads its transcript.
Nine scoped review scenarios pass; production migration safety remains conditional
on the deployment prerequisites above.

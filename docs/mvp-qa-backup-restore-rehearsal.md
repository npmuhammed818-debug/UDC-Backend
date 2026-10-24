# UDC fictional PostgreSQL backup/restore rehearsal — non-production CI

This is a **disposable-database exercise**, not a backup, migration, export, or restore of Supabase production data. Runs only as a dedicated step of the GitHub `email-migration-review` job.

## Safeguards
- Requires `UDC_MIGRATION_QA_DATABASE_URL` on loopback `127.0.0.1` or `localhost`, with the fixed QA user `udc_migration_test`, no password, the isolated `udc_qa_migration_*` control database, and a **64-digit GitHub Actions PostgreSQL service container ID**. A remote URL or absent service container ID makes the script stop before any DDL.
- Creates two randomly named, disposable databases with strictly synthetic records. All CREATE, UPDATE, DELETE, pg_dump and pg_restore commands target only those child DBs.
- Uses `docker exec` to run `pg_dump -Fc` and `pg_restore` from the exact PostgreSQL service container image, avoiding a client/server version mismatch. The binary archive stays in CI process memory; it is **not uploaded** as an artifact. The log includes only an abbreviated integrity digest and aggregate outcome, never fixture email/phone, keys or archive bytes.
- The script applies the exact additive migrations in dependency order, seeds one fictional identity, recovery challenge, shipment/cargo/ETA, Meta outbox + receipt, signed inbound-window evidence and role-review request.
- It verifies all ten new tables contain exactly the saved records, RLS remains enabled, client roles have no direct CRUD grants, privileged outbox permissions remain non-destructive, and the outbox unique key still prevents duplicates.
- After taking a custom-format backup, deliberately mutates **only the source QA database** and restores the saved pre-mutation image into a different QA database. Asserts the original verified email, WhatsApp number, shipment status, Meta send/receipt state and entire per-table data checksum are restored.
- Both temporary DBs and test-only PostgreSQL roles are cleaned up. Restore failure, client-privilege exposure, missing RLS, identity change or incorrect record snapshot must fail GitHub CI.

## Limitations
- Rehearses PostgreSQL **schema + fictional data** only. Does not test real Supabase connection/TLS, secrets, Storage buckets and signed documents, database extensions outside the fixture, RLS policy equivalence on existing production tables, real provider messages, active writes during a backup, or real time-to-restore under traffic.
- Passing CI is **not production restore proof**. A separate owner-approved staging restore using a complete consistent backup, verified PITR configuration and human rollback drill remains mandatory.
- Does **not** authorize applying new migrations, merging MVP drafts, changing Render/Supabase, sending OTPs or WhatsApp messages or touching live customer records.

Related release checklist: `docs/mvp-integrated-staging-gates-20261024.md`.

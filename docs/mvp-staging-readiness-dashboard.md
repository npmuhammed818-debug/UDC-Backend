# MVP staging-readiness dashboard — draft, read-only

**Scope:** A mobile-friendly admin screen at `/admin/staging-readiness`, backed by `GET /api/admin/release/staging-readiness`. This is a **diagnostic, not a deployment or staging authorization mechanism**. It performs no customer queries, provider calls, email sends, WhatsApp sends, migrations, uploads, or environment changes.

## Access and evidence

- Every backend request requires an already authenticated and non-suspended **admin**. Unauthenticated, buyer, seller, agent and suspended accounts are rejected before database access.
- The backend returns only fixed, human-readable *configuration present/missing* checks. It never returns provider tokens, database URLs, email addresses, secret lengths, or actual environment values. All responses are `Cache-Control: no-store`.
- One read-only PostgreSQL **catalog** query inspects a hardcoded allowlist of nine migration tables: OTP challenges/limits, verified-email phone recovery, shipment milestones/cargo/ETA, notification outbox, Meta receipts and customer-service windows. It checks table presence and RLS; detects direct `anon`/`authenticated` CRUD grants; verifies service-role least privilege, absence of destructive `TRUNCATE`/`TRIGGER`/`REFERENCES` rights, and the expected critical unique replay/index per table. Missing roles also fail closed. **This does not validate all constraints, foreign keys, schema data consistency, migration idempotency, backups or live provider delivery.** The catalog security result is never a launch approval.
- If the query fails, show **unavailable**. Never infer schema success from a network or connection error.
- The page always returns `launchReady:false`, `stagingApproved:false`, `schemaVerified:false`. Even all tables present with RLS and configured keys are **insufficient to approve a launch**.
- Review flags explicitly: transactional email delivery, Meta inbound-window evidence, optional ETA follow-ups and dormant outbound WhatsApp worker. No status-changing actions are exposed.

## Limits before deployment

The integrated QA PR #140 already passed UDC verification #483, AKIF stack #538 and local PostgreSQL test fixtures. Those tests are **not a substitute** for a separately authorized staging environment and independent deploy review.

The owner still needs to review the exact Render/Supabase/Meta staging targets, backups and restore drill, database role grants, live Meta number/webhook/template approvals, verified Resend sending domain and OTP delivery, signed document access, buyer/seller/agent human UAT, shipping milestones and DLC/destination-SGS policies.

This dashboard is **not currently deployed**. Do not merge or deploy it, migrate Supabase, enable mail or WhatsApp send flags, or contact real customers without separate owner authorization. Tests use fictional data only.

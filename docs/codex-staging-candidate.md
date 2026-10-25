# Codex staging candidate — review required

Baseline: `dev/whatsapp-durable-dedup-20261025` at
`d437383b50ca35944516d250b4d4c8c96078c8b6`. This is a descendant of the
`8b53a1e` integration and preserves its earlier email, recovery, shipment,
permission, consent, vault, referral, commission, voice and buyer-pool work.
No source branch, main, hosted database or production setting was changed.

## Confirmed defects corrected

- Vault bearer upload tokens were included in request-log URL paths. Request
  logging now redacts these paths, including mixed-case and malformed suffixes.
- Acceptance reporting aborted before running because 17 added suites had no
  feature assignment. All current suites are assigned; missing-suite detection stays enabled.
- Durable deduplication had only draft deployment SQL and a tautological RLS
  assertion (`value || true`). The versioned candidate migration enables RLS,
  revokes client/PUBLIC grants, restricts service-role permissions to DML and
  bounds lock/statement waits. The retry test applies the exact SQL twice and
  asserts actual RLS and effective grants. Hosted execution is not authorized.
- Email SQL fixtures assumed client roles never existed, preventing combined
  execution in one disposable PostgreSQL service. Existing roles are preserved.
- Dependency auditing initially reported 36 advisories, including critical
  `proxy-addr` and high-severity runtime parsing/validation issues. Updated the
  lockfile, security-related pins and generated Zod validators. Final pnpm audit
  reports zero known advisories; this is not a guarantee against unknown flaws.

## Executed validation

- Frozen pnpm installation; OpenAPI code generation and library typechecks.
- Full release verification: 317 distinct backend tests, no failures/skips,
  workspace typechecks, frontend and backend builds. The build repeats backend
  tests; do not double-count them.
- Eight acceptance groups passed; counts overlap. Three additional JavaScript
  receipt/outbox/ETA suites passed. Python worker/extractor: 29 passed, one
  upstream deprecation warning; Python compilation and Hermes compose validation passed.
- Ten real local PostgreSQL suites passed: signed WhatsApp onboarding, durable
  retry/concurrency and injection boundaries, email/phone recovery, company
  verification, marketplace/agent privacy, vault, buyer pools, trade/document
  journey, commission routes and three-decimal migration/rollback.
- Exact email and shipment/role migrations passed isolated privilege/compatibility
  checks. Existing real pg_dump/pg_restore rehearsal passed on ten fixture tables.
  That rehearsal does not yet prove a complete restore of the newer vault/dedup
  tables or any Supabase storage objects.
- Compiled application started against fictional loopback PostgreSQL. Health,
  frontend HTML and anonymous admin denial passed. Missing WhatsApp configuration
  was reported as expected; no provider credentials were supplied.

SQL transactions, routes and database authorization were real in these checks.
Existing fixtures replace external mail, Meta, AI and storage boundaries. No
production functionality was replaced with a mock. These results do not prove
external delivery, hosted storage authorization, live AI quality or human UAT.

## Reproduction

Use Node 24, pnpm 11 and the pinned PostgreSQL image from `.github/workflows/ci.yml`.
`scripts/qa/run-postgres-integration.mjs` requires an explicit disposable Docker
service container ID in `UDC_QA_POSTGRES_CONTAINER_ID`, loopback port 5432 and the
fixture superuser `udc_dev`. It creates randomly named databases, bootstraps only
those empty schemas, runs each suite, writes `.acceptance-results/*-postgres.log`
and drops its databases. `--case=<file-prefix>` selects a targeted retry;
`--extended` omits onboarding/email suites already covered by other CI jobs.
The new CI job runs the remaining real-SQL suites and retains their logs.

## Remaining release gates

This candidate is locally validated for review, not approved for deployment or a
complete live MVP. See `mvp-integrated-staging-gates-20261024.md` and the feature
documents for the unchanged human-review and DLC/destination-SGS controls.

1. Review this exact candidate and obtain green hosted CI on its final SHA.
2. Provide an approved isolated staging service/database and test-only storage
   bindings securely. Review migration ordering, actual role grants, verified TLS,
   all new tables, full backup/restore and rollback before hosted execution.
   The commission widening draft still requires its documented schema/flag rollout.
3. Authorize external tests separately: private Supabase storage authorization,
   approved sender/domain and real email delivery, registered Meta test number,
   webhook/template receipts, actual worker/provider behavior and authorized
   buyer/seller/agent/admin UAT. Do not infer permission from historical approvals
   quoted in documentation. No test-project credentials were present here.
4. Keep email/voice/reaction/window-evidence/ETA/outbound activation gates unchanged
   until their respective reviews. The existing shipment outbox has no live send
   worker/approved adapter wired; this remains unfinished for automatic outbound
   shipment delivery and requires the agreed delivery/template policy before wiring.
5. GitHub API access returns Forbidden in this environment. Native Git HTTPS works;
   PR creation/hosted check inspection must be retried after API access is enabled.

No real messages, hosted database changes, provider calls, paid services, merges
or deployments were performed by this work.

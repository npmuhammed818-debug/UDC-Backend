# Full MVP integration and controlled staging plan

## Decision and boundaries

This branch starts at `83fddc6cd8fba5f7fa6f2edc36a27aba9cdd2bb2` (#185).
It contains reviewed copies of #181 `d71c157`, #182 `767f0fa` and Instinct's
onboarding `1578783`. Original branches/PRs were not edited or merged. The report
freezes these revisions; later parallel commits require a new integration review.

**Local synthetic checks can pass while full MVP acceptance remains unverified.**
No approval to deploy, change a hosted database, enable outbound flags, send real
messages, activate email, spend money or merge is implied. Role activation is an
explicit unresolved decision: current code supports request/review only, retaining
the original role and permissions. Do not silently rewrite canonical roles or
create a second account to bypass this limitation.

The continuous lifecycle fixture uses actual web/API registration, one-time email
ownership proof, vault upload/review, matching, document drafts, shipment and
DLC/SGS/completion records for the same fictional users. Separate signed WhatsApp
fixtures exercise all three roles, invalid inputs, repeated delivery, interruptions,
cancel/edit/restart, email proof and requirements/multiple offers. This does not
claim one uninterrupted natural-language WhatsApp conversation through the whole
trade lifecycle. Actual models, inboxes, Meta, storage and human UAT remain gates.

## Automated evidence and reproduction

`node scripts/acceptance/full-mvp.mjs` runs code generation/contract-drift checks,
full release checks, eight feature groups, all JavaScript receipt/outbox/ETA tests,
all Python worker/extractor tests, Python compilation, Hermes compose validation,
dependency audit, every PostgreSQL suite, exact migration reviews and pg_dump/restore.
It creates a fresh `.acceptance-results/full-mvp-<random>/` directory with logs,
JSON and a capability-by-capability Markdown PASS/FAIL/NOT YET VERIFIED report.
Source digests detect changes during the run. Zero-test/incomplete PostgreSQL
inventory cannot count as success. Test groups overlap; do not add their counts.

Use Node 24, pnpm 11, the frozen lockfile, OpenSSL, Docker and Python 3.12 with
CI's existing test dependencies. Set `UDC_QA_PYTHON` to a test interpreter if needed
and `UDC_QA_POSTGRES_CONTAINER_ID` to the full ID of the **disposable local** pinned
PostgreSQL service from `.github/workflows/full-mvp-acceptance.yml`. It must expose
loopback port 5432 and provide the test superuser `udc_dev`. The runner creates
and removes only randomized QA databases and missing fixture roles. Never pass
hosted credentials. No mail, Meta or model credentials are needed. HTTPS proxy
and CA settings are retained for package auditing, without disabling verification.

The comprehensive CI workflow is manual (`workflow_dispatch`); existing PR checks
also run the new lifecycle and onboarding suites. No live-provider test is run by
CI. Production smoke and `scripts/staging/storage-authorization-check.mjs` are
intentionally excluded until the owner approves an exact external test target.

A confirmed defect found here is fixed: PostgreSQL role-request audit JSON needed
explicit `::text` casts for role parameters. The real lifecycle test failed before
the fix and passes afterward. No role activation or business rule was added.

## Migration preflight and order — preparation only

1. Name the exact staging project/service, revision, DBA/operator and rollback
   owner. Confirm it is separate from production and contains only fictional
   records. Read the actual PostgreSQL version, extensions, schema, effective app
   principal/inherited grants, RLS, indexes/triggers and existing migration ledger.
   Compare with `lib/db/src/schema`; fail on unexplained drift.
2. Verify the established baseline migrations before applying newer SQL. Inventory
   includes `lib/db/migrations/0001`–`0008`, `0013`–`0015`, dated WhatsApp sign-in
   and chat-session migrations, and `lib/db/src/migrations/0015_notification_preferences.sql`
   and `0016_small_buyer_pools.sql`. Two directories share sequence numbers: do not
   concatenate/sort all files blindly. Existing QA bootstrap uses schema push only
   in empty disposable databases; this is **not proof** that the full historical
   SQL chain upgrades a real project without drift.
3. With baseline prerequisites confirmed, review/apply exact SQL in dependency order:
   email authentication → WhatsApp phone recovery → shipment tracking events → cargo
   units → ETA follow-ups → shipment outbox → delivery receipts → customer windows →
   role-change review → vault upload links → durable inbound deduplication. Use the
   exact dated filenames in `lib/db/migrations`. Apply each with a reviewed session
   lock budget (example 2 seconds) and statement budget (example 15 seconds), a
   low-traffic window, and abort/rollback on contention. These are proposals, not
   production settings applied by this work.
4. Verify preservation of user IDs, verified email, role/status, company/document
   ownership, deal/referral/commission links, preferences, sessions, OTP/phone
   challenges, vault token state and accepted/uncertain notification state. Check
   RLS/client denial and app permissions on audit logs/message contexts as well
   as the new tables. `drizzle push` alone omits required trigger/RLS/grants.
5. The three-decimal commission SQL remains a separately reviewed draft. Keep
   `UDC_COMMISSION_STORAGE_DIGITS` unset/2 until its documented schema/flag plan
   is approved and applied. Never enable a flag against a scale-2 column or narrow
   a scale-3 column containing data. See `commission-3-decimal-migration-plan.md`.
6. Validate with the actual backend principal and verified TLS in the approved
   non-production endpoint. Local synthetic owner/service-role checks are not proof
   of a hosted project's complete permissions or certificate compatibility.

## Backup and rollback

Before any hosted migration, take an approved consistent **full database** backup
and verify existing restore/PITR facilities without purchasing upgrades. Include
schema/data, extensions, grants/RLS/functions/triggers and a separate inventory of
roles/global settings as appropriate. Back up private Storage objects and ownership
metadata too; a database dump contains object references, not the file contents.
Store backups securely, outside application logs and public CI artifacts.

Rehearse restoration into a second isolated target. Verify counts/checksums,
identities, document ownership, signed URL policy/expiry, session/challenge state,
commissions, outbox uniqueness and accepted/uncertain receipts before declaring
success. Record measured RPO/RTO and the operator's abort criteria. The committed
14-table fictional pg_dump/pg_restore rehearsal is useful evidence, not a complete
Supabase project/Storage restore or a production recovery-time guarantee.

If staging fails, stop scanners and new sends first. Quarantine ambiguous sends;
never reset attempts/leases or replay accepted jobs. Roll application code back to
an explicitly chosen compatible revision while retaining additive schema/audit and
consent history. Database rollback requires a tested restore or reviewed forward
fix. Do not execute ad hoc DROP statements or narrow commission amounts to force
compatibility. Prior signed URLs may remain valid until their existing expiry.
Reverting a consent version may prompt users again; never erase consent history.

## Configuration and feature flags

Securely bind only test credentials after target approval. Preserve an existing
strong `SESSION_SECRET` (32+ characters); do not rotate it casually. Check separate
`SUPABASE_DATABASE_URL` and migration/direct URL requirements, exact CA and hostname,
private storage bucket and policies, `VAULT_PUBLIC_BASE_URL` as an **HTTPS origin**
(the code appends `/api/vault/upload/<token>`), staging public app URL/number,
worker authentication and data-processing approvals. Do not paste values into chat,
commits, reports or model prompts.

| Setting | Default for preparation | Activation prerequisite |
| --- | --- | --- |
| `UDC_SHIPMENT_WHATSAPP_SEND_ENABLED` | false/unset | Explicit send approval, reviewed pending queue, staging number and template/recipient tests |
| `UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED` | false/unset | Reviewed window migration and exact signed webhook/number binding |
| `UDC_ETA_FOLLOWUPS_ENABLED` | false/unset | Approved daily-advisory semantics and staging schema |
| `UDC_AUTH_EMAIL_SEND_ENABLED` | false/unset | Approved provider/domain/from address and designated test inboxes |
| `UDC_AUTH_EMAIL_TRANSPORT` | no live activation | Reviewed provider configuration; current adapter supports Resend |
| `UDC_WHATSAPP_REACTIONS` | unset (not `on`) | Approved recipient/Meta tests; no proactive reaction activation here |
| `AKIF_VOICE_REPLIES` | unset (not `on`) on API and worker | Approved provider/data handling; reviewed fixed-response allowlist |
| `AKIF_WORKER_CONVERSATION_ENABLED`, `AKIF_WORKER_MEDIA_ENABLED` | unchanged/no activation | Approved staging worker/model and permitted data processing |
| `AKIF_HERMES_AUTO_LEARN` | false/unset | Explicit opt-in; learned proposals remain subject to human approval |
| `AKIF_STARTUP_MODEL_PROBE`, `AKIF_STARTUP_GEMINI_PROBE` | false/unset | Separately approved provider calls/cost/data processing |
| `UDC_COMMISSION_STORAGE_DIGITS` | unset/2 | Reviewed widening migration and compatible schema before 3 |
| `WHATSAPP_VERIFICATION_REPLAY_USER_IDS`, `WHATSAPP_DEAL_STATUS_REPLAY_ID`, `WHATSAPP_DEAL_SUMMARY_REPLAY_ID` | unset | No replay markers for genuine customer/deal records |

The shipment flag does not globally disable all legacy WhatsApp replies or company
verification paths. Supplying real Meta credentials or enabling startup replay
markers can activate those paths. Do not inject them into automated synthetic
acceptance or connect a live number before approval. Enabling any new worker must
not accidentally process an old/production queue.

## Template, recipient and staging human acceptance

Use only the owner-approved test number/WABA, known sender phone ID, signed webhook
subscription and fabricated buyer/seller/agent/admin identities. Maintain a written
list of approved test recipients with current policy consent and opt-in. Do not
clone genuine customer contacts into staging. Review templates and any Meta costs
before authorizing messages; no free-plan or zero-cost assumption is made.

The sender requires an exact APPROVED UTILITY template, name/language and fixed
zero-variable BODY from `whatsapp-shipment-outbox.md`. Pending/paused/marketing or
changed components block sending. Inside the signed window, its five-minute safety
margin still applies. Test out-of-order/replayed receipts, STOP/withdrawal, role
revocation, phone recovery, worker/provider outages and uncertain submissions.

Human UAT must cover all three roles, real OTP delivery, secure storage, natural
AKIF guidance/languages/media, requirement/offers, explicit trade terms, document
review, manual company approval, DLC directly to seller, destination SGS evidence,
shipment/ETA, completion, referral and commission reconciliation. No software test
issues a bank instrument, certifies SGS authenticity, transfers funds or executes
a legal contract. Current carrier tracking can remain sourced manual records;
do not describe those records as verified live carrier feeds.

## Ranked remaining gates

| Priority | Gate | Required action |
| --- | --- | --- |
| P0 activation gate | No hosted target or real sending approved in this task | Owner designates isolated staging resources, test recipients and separately authorizes external tests/deployment; keep all sending off |
| P1 product decision | Canonical role activation is intentionally absent | Owner confirms request/review-only staging scope or approves a separate identity/access transition design; never silently change roles |
| P1 infrastructure | Actual migration baseline, TLS/app principal/RLS and Storage access are unverified | Approved staged preflight, migration/permissions audit and complete database/object restore drill |
| P1 external acceptance | Real email, Meta templates/receipts, model quality and human end-to-end UAT remain unverified | Provider/domain/number approval, protected test bindings, controlled tests and evidence |
| P1 legal/operations | New consent wording/business support address are draft inputs | Confirm reviewed legal wording, notice URLs, mailbox ownership and operational review/recovery process |
| P2 scoped rollout | Three-decimal commission storage is still gated | Follow its separate migration/schema plan before testing those amounts |
| Review tooling | GitHub API access has previously returned Forbidden | Retry draft creation/check inspection; if still blocked, enable API access or open the prepared draft manually |

There is no claim that UDC is production-ready, fully accepted, or authorized for
live sending merely because isolated checks pass. Staging may proceed only within
the owner's approved scope and after the relevant gates above are satisfied.

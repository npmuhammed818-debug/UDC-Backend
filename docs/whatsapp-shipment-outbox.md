# Shipment and deal notifications — staging candidate, not deployed

Based on draft PR #180 (`48c521a`). Sending is **disabled by default**. No real
messages, hosted changes, deployment or billing were authorized or performed.

## Delivery and privacy

Shipment milestones, shipment/cargo status, ETA-only edits, ETA follow-ups,
document reviews and relevant deal/inspection/customs/payment-record updates
produce in-app notifications and one outbox intent per notification. The old
direct-send path is bypassed for these event classes. Milestone and cargo
ETA/status notifications share the source transaction: a queue failure rolls
back the source update, allowing safe retry with the same idempotency key.

The runner polls every 30 seconds, at most five jobs per batch. Concurrent
replicas use SKIP LOCKED and unique lease tokens. Before sending, the dispatcher
checks verified role, current phone, current-policy consent, preferences and
current deal membership. Removed agents, unverified/suspended users, outsiders
and opted-out recipients cannot receive queued messages. A new phone requires
fresh consent; old-number window evidence is not reused.

Text comes from a fixed allowlist, never from the stored in-app body, review
note, document name/URL, bank details or trade terms. Assigned agents receive
only generic shipment updates; document and financial alerts are denied to them.
Accepted provider IDs are bound to the intended deal/user in message contexts.
ETAs and alerts never approve inspection, company verification or payment.
The DLC directly to seller / destination-SGS controls remain unchanged.

## Meta policy

Inside a signed customer-service window, with a five-minute expiry margin,
send fixed event-specific text. Missing, expired or old-number evidence requires
a template. Each template send first reads the configured WABA's catalog.
Name/language must match exactly, status APPROVED, category UTILITY, and the sole
component must be a BODY with exactly this text (no variables, headers or buttons):

> There is an update on your UDC deal. Open My deals in WhatsApp to review the details you are authorized to see.

UDC does not create or approve templates. If Meta rejects that wording, review
replacement wording/code separately. Calls use the existing Meta v21 HTTPS
integration, deadlines, redirect refusal and bounded responses. Credentials and
provider response bodies are never logged.

## Retry, receipt and operator behavior

- Known pre-send failures and confirmed Meta 429 rejection use one-minute then
  five-minute backoff, at most three total attempts.
- Accepted means Meta returned an ID, not delivery/read. Signed receipts use
  the existing durable journal and monotonic progression. Exact HMAC, configured
  sender number and intended recipient must match. Early receipts reconcile
  after acceptance commits; failed receipts never automatically trigger resends.
- Timeouts, 5xx, malformed acknowledgements and expired leases are uncertain:
  never automatically resend. Meta may have accepted the request. No invented
  Meta idempotency API or exactly-once-delivery guarantee is claimed.
- Outcomes and lease expiry are atomically audited using safe metadata. A DB
  failure after submission requires investigation, not blind replay.

Read-only mobile admin page: `/admin/shipment-notifications`. It shows submission
and delivery states, attempts and issues, with no sending/activation controls.
All admin API paths below use `/api` prefix:

| Method/path | Behavior |
| --- | --- |
| GET `/admin/notifications/whatsapp-shipment-outbox` | Latest 100 entries and optional submission-status filter; no phone/content/token; no-store |
| POST `/admin/notifications/whatsapp-shipment-outbox/dispatch` | Bounded scan; request cannot override disabled flag |
| POST `/admin/notifications/whatsapp-shipment-outbox/:id/retry` | Audited release of blocked unsent jobs below three attempts; cannot reset counts or release accepted/uncertain jobs |
| POST `/admin/notifications/whatsapp-shipment-receipts/reconcile` | Existing signed journal only; no sends |

Investigate uncertain/failed jobs with approved provider-side evidence. Do not
edit attempts/status or replay source events to force delivery. Disabling the
send flag stops subsequent scans; an already submitted request cannot be recalled.

## Staging activation — separate approval required

1. Review the exact draft and green hosted CI. Use an isolated staging database
   with fictional records, explicit consent/preferences and only approved test
   numbers. Inspect the pending queue before enabling it.
2. Apply existing outbox, receipt and customer-window migrations in documented
   dependency order, plus tracking/cargo/ETA schemas. No new migration is added
   here. Verify actual application-role access to outbox, receipts, notifications,
   audit logs and message contexts. Preserve client RLS restrictions and follow
   existing backup/restore and verified-TLS gates.
3. Securely configure existing `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET` for the staging number.
   Confirm its webhook subscription, exact HMAC and delivery callbacks.
4. Obtain actual Meta approval for the exact UTILITY template. Configure its
   `UDC_SHIPMENT_WHATSAPP_TEMPLATE_NAME` and
   `UDC_SHIPMENT_WHATSAPP_TEMPLATE_LANGUAGE` exactly.
5. After approval, set `UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED=true` and validate
   inbound evidence. Only then enable `UDC_SHIPMENT_WHATSAPP_SEND_ENABLED=true`
   for approved staging sends. Keep false/unset elsewhere. ETA scanning remains
   separately gated by `UDC_ETA_FOLLOWUPS_ENABLED`.
6. Test actual delivery/read/failure, expiry/template sending, STOP/withdrawal,
   phone recovery, revoked roles and outages with designated recipients. Review
   pricing/limits before authorizing billable activity. Production is a separate
   approval; email activation is unrelated and unchanged.

## Executed evidence

- Five new unit tests cover disabled transport, role/content allowlisting, exact
  template checks, fixed endpoint, rejection, rate limits, oversized responses
  and ambiguous provider outcomes.
- Eleven real PostgreSQL scenarios exercise actual admin milestone/ETA routes,
  source/queue rollback, concurrent dispatch, privacy/phone/consent gates, template
  policy, retry limits, signed/early callbacks, sender/recipient binding, lease
  quarantine, contexts and admin visibility. Only Meta is simulated.
- Full release verification passed 322 backend tests, typechecks and builds.
  Eight acceptance groups and three outbox/receipt/ETA JavaScript suites passed.
  All eleven PostgreSQL suite programs passed, including existing registration,
  recovery, permissions, vault, trade and commission regressions.
- Mobile Chromium simulation passed status rendering/refresh, disabled indicator,
  no activation controls, buyer guard and zero page errors. API responses were
  simulated locally; backend permissions separately passed with PostgreSQL.
  Dependency audit: zero known advisories.

Reproduce with the pinned disposable PostgreSQL service:
`UDC_QA_POSTGRES_CONTAINER_ID=<local-service-id> node scripts/qa/run-postgres-integration.mjs --case=shipment-delivery`.
The fixture rejects hosted URLs and intercepts Meta calls. It runs in the
extended PostgreSQL CI job. This is not live Meta acceptance, template approval,
hosted role validation or full business UAT.

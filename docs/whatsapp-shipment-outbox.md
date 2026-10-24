# UDC shipment WhatsApp outbox — draft QA, NOT deployed

The WhatsApp shipment alert outbox is **durable but dormant**. It queues a single send intent for each in-app notification. No production runner automatically sends it, and no live Meta sender is wired to this module.

## What is queued
- Shipment created/status/milestone/delay/exception updates and cargo progress: the admin paths now record in-app notifications plus outbox records in the same transaction. The former direct WhatsApp sending path is bypassed for shipment alerts so old and new paths cannot both send.
- Overdue ETA reminders and stale location reports: #133's deterministic daily scan creates the in-app notification, matching outbound intent and audit record in one transaction. It cannot create repeat intents for the same notification.

The outbox persists **notification ID, deal ID, recipient user ID, status, counts, provider acceptance message ID, safe failure category and timestamps**. It does **not** persist phone numbers, WhatsApp tokens, private documents, location records, or signed download links.

## Safety semantics

- **Pending**: notification exists but no outbound send was attempted.
- **Leased**: one worker holds a 90-second lease while checking eligibility and attempting submission.
- **Retry**: only known *pre-send* failures can retry, with 1-, 5- and 30-minute backoff and no more than three total attempts.
- **Accepted**: the provider acknowledged acceptance and returned a provider message ID. This does **not** mean the recipient received or read it. Delivery status webhook mapping and receipts still need to be built.
- **Uncertain**: Meta could have received the message; if the worker crashes after a possible send, an HTTP timeout occurs, or Meta acceptance returns no message ID, the intent is held for human/provider reconciliation. **No automatic resend.**
- **Blocked**: policy permission is missing, provider rejected the request or retry limit reached.
- **Cancelled**: account deactivated or number unavailable, opted out of optional WhatsApp reminders, or recipient no longer belongs to the deal.

The dispatcher requires *all* of: `enabled:true`, injected test/approved transport and a separately injected `policyAuthorized()` function. That function must verify a signed Meta inbound conversation within the allowed window **or a previously approved WhatsApp template for proactive delivery**. The module has **no live authorization adapter** today. Fail closed; do not flip an environment flag to bypass it.

Before a send, it loads the account's **current** phone and status, matching notification, current deal membership or active agent assignment, WhatsApp notification preferences, and mandatory messaging policy authorization.

Operators can review sanitized status, attempt counts and safe failure categories from `GET /admin/notifications/whatsapp-shipment-outbox?status=uncertain` (admin-only). This endpoint does not reveal phone numbers or message content, and cannot force a resend.

## Migration and acceptance

Apply `lib/db/migrations/20261024_whatsapp_shipment_outbox.sql` **only to staging** after the cargo and ETA migrations, following a reviewed backup and rollback plan. RLS is on, client roles have no direct grants, and `service_role` has SELECT, INSERT and UPDATE only. PostgreSQL rejects inconsistent leases and duplicate notification keys.

Isolated QA tests verify unique queuing, failure rollback, shipment direct-send suppression, policy denial, STOP opt-out, bounded safe preflight retries, unknown-provider outcome quarantine, expired leases, and provider acceptance semantics.

**Outstanding before launch:** validate real Meta template/window permissions, persist signed recent inbound evidence, wire a guarded worker only after owner approval, attach provider delivery/read statuses, monitor unknown attempts for operator review, staging end-to-end, and approved migration/deployment. No production notification delivery is claimed.

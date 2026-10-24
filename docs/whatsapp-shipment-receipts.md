# Signed Meta WhatsApp delivery receipts — draft QA

**No production migration, deployment, Meta dispatch or outbox worker activation.** This feature extends the dormant shipment outbox from PR #134.

Meta's successful send API response and message ID mean **accepted by the provider**, not delivered or read by the recipient. The outbox therefore keeps two separate concepts: `status=accepted` for the submission, and `delivery_status=unconfirmed|sent|delivered|read|failed` for later signed callbacks. Timestamps `delivered_at`, `read_at`, `failed_at` are callback-reported, not inferred from shipping activities.

Only the already-validated, raw-body HMAC-authenticated `/webhooks/whatsapp` endpoint can process incoming Meta status callbacks. They cannot reach the user chat, Akif, automated trade intake or consent handling. We validate the status, Meta message ID, recipient number and callback time; invalid records are ignored. Persistence errors return 503 so Meta can retry. A callback can update an accepted outbox row only when its message ID matches the previously saved Meta message ID **and** the callback recipient matches the user's currently bound number. Status updates are monotonic: a late `sent` or `failed` cannot downgrade a `read` state, and a `sent` cannot overwrite `delivered`.

The restricted `whatsapp_shipment_receipts` journal stores only provider message ID, callback status, provider timestamp, a secret-keyed HMAC fingerprint of the recipient, and application timestamps. **No raw phone number, message body, document or provider error details** are persisted there. A unique provider/status/time index rejects identical event duplicates. Signed events received before the send worker persists a provider ID remain unmatched; the admin-only `POST /admin/notifications/whatsapp-shipment-receipts/reconcile` can safely reconcile them **without sending anything**, but only if the recipient's *current* number matches the stored fingerprint. A 30-day metadata retention cleanup runs during reconciliation.

The admin-only `GET /admin/notifications/whatsapp-shipment-outbox` shows safe statuses, attempts and delivery/read timestamps; it cannot trigger a send. Missing verified provider receipts remain `unconfirmed`, never reported delivered.

## Before real WhatsApp launch

- Stage and independently review the additive `20261024_whatsapp_shipment_receipts.sql` migration **after** the PR #134 outbox migration. Confirm RLS/client revocations, uniqueness and backup/rollback plan with owner approval.
- Obtain final production WhatsApp number and confirmed Meta subscriptions. Validate HMAC, callbacks, statuses, delays, rate limits and template permissions in staging with test customers and documented consent.
- Implement and approve the optional sender's verified 24-hour conversation-window evidence or reviewed proactive WhatsApp template. The **shipment outbox sender remains disabled**.
- Add scheduled reconciliation/retention execution, operator handling for unresolved Meta timeouts, and monitoring for provider callback gaps. Account recovery, OTP provider approval and full trade MVP acceptance remain independent release gates.
- Verify old-number revocation and ensure no stale delivery receipt can attach to a newly linked phone.

All GitHub tests use fictional data and disposable PostgreSQL. A green CI check is **not** proof of real Meta delivery.

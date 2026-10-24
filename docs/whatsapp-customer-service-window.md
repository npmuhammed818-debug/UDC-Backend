# Signed WhatsApp 24-hour conversation evidence — QA only

This PR adds an explicit fail-closed authorization for **ordinary free-form shipment texts**. Meta's September 23, 2026 WhatsApp Business Messaging Policy allows free-form business replies for 24 hours after the most recent customer message; outside that window, only separately **approved message templates** are permitted: https://whatsappbusiness.com/policy/.

## Evidence recording

The **existing raw-body HMAC-verified webhook**, after privacy consent and an active verified-user lookup, records the timestamp of an incoming customer message in `whatsapp_customer_windows`. Recording is behind `UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED=true`, **OFF by default**. Before that switch can be enabled, the matching additive migration must be applied to staging and reviewed with production owner approval.

The webhook must also identify **UDC\'s configured `WHATSAPP_PHONE_NUMBER_ID`** through Meta\'s signed `metadata.phone_number_id`; events for another sending number cannot open a free-form window. The event's source is the signed provider `message.timestamp`, not the delivery processing clock. Timestamp must be valid and within the past 24 hours (plus at most 2 minutes of clock tolerance); otherwise it is ignored. The last valid inbound timestamp is updated **only if strictly newer**. Repeating old Meta webhook payloads cannot refresh a service window.

The table stores user ID, HMAC-SHA256 fingerprint of their current WhatsApp phone, HMAC-SHA256 fingerprint of the provider message ID, last inbound time and record time. It never stores the raw phone, raw message ID, message content, Meta token, document or source payload. Table is RLS-enabled and unavailable to direct client roles; service role has only SELECT/INSERT/UPDATE.

## Sending authorization

`authorizeCustomerWindow(phone,userId,dealId)` can be injected as the outbox's `policyAuthorized` callback **only after owner-approved staging acceptance**. It matches the current account's verified phone and stored fingerprint and rejects customer windows within five minutes of expiry, missing/stale/old-number evidence, revoked user, altered hashes or configuration errors.

This is one gate, not the entire consent policy. The outbox also checks current identity, explicit opt-in, deal membership and status before attempting a message. The optional production sender remains **dormant**. No Meta API sending or automatic template approval is added.

Outside the 24-hour customer window the free-form sender returns false; UDC must either notify in-app, request a customer reply on WhatsApp, or **later** implement reviewed, approved Meta templates with separate content and recipient-consent checks. Do not circumvent these rules or claim live delivery.

## Staging and release gates

1. Review and apply additive `20261024_whatsapp_customer_windows.sql` in a separate staging database; verify safe repeat-run, role grants, backup and rollback. It depends on existing users, not new cargo migrations.
2. Use Meta's sandbox/approved test number and actual signed incoming WhatsApp messages for QA (without real customers).
3. Verify STOP opt-outs, expired window, replayed payloads, number recovery, template approval status, provider receipts and operator escalation with human acceptance.
4. Wire a separately approved sender adapter and disabled-by-default worker **only after** the company approves live messaging and API billing. Do not silently send queued outbound messages.
5. Confirm email OTP provider, number onboarding and other draft MVP migrations independently. Passing GitHub tests does not mean production is ready.

There is **no live deployment**, no new Meta messages or production database migration in this PR.

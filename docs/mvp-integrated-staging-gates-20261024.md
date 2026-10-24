# UDC MVP integration and staging gate — October 24, 2026

**Status: QA integration only. Not an approved live release.** Draft PR #140 is a combined *candidate*, not a production deployment, and is separate from live `main`. Earlier PRs #127/#129/#130/#131/#132/#133/#134/#135/#137/#138/#139 remain drafts. Previously merged PR #136 (ImpexQ admin test) is preserved.

## Mandatory deploy ordering

Use a *separate staging project* with fabricated identities, trade documents and phone/email recipients. Never point these test programs at a production PostgreSQL URL, real WhatsApp credentials or a real email sending key.

1. Snapshot the staging database and record the exact current schema and app version. Confirm lock timeouts, disk headroom, access and rollback owner. Do not run `drizzle push` as a substitute for SQL migrations.
2. Review and apply `lib/db/migrations/20261023_email_authentication.sql` with least-privilege RLS/grants and email-change trigger.
3. Apply `lib/db/migrations/20261024_whatsapp_phone_recovery.sql`. Validate one-time OTP, previous verified-email ownership, no unverified user takeover and old-number session revocation. Phone change preserves user ID and linked deals, and is *not* a silent cross-account merge.
4. Apply `lib/db/migrations/20261024_shipment_tracking_events.sql`, followed by `20261024_shipment_cargo_units.sql` and `20261024_shipment_eta_followups.sql`. Do not fabricate real carrier scans, delays, SGS results or actual GPS from predicted ETA.
5. Apply `lib/db/migrations/20261024_whatsapp_shipment_outbox.sql` **after** the notification/deal/account tables; follow with `20261024_whatsapp_shipment_receipts.sql`. Check unique send intents, out-of-order Meta receipt behavior, irreversible uncertain-sent queue status, invalid message/phone rejection and admin read-only visibility.
6. Apply `lib/db/migrations/20261024_whatsapp_customer_windows.sql`. Keep `UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED` unset until Meta webhook tests verify exact raw HMAC, recipient number ID and customer opt-in.
7. Confirm unchanged customer profile rows, user IDs, reference-linked deals, existing sessions, verification status, contact preferences and signed document access against pre-migration snapshots. Do not promote if evidence is incomplete.
8. Deploy candidate to **staging only** after review. Run a fictional buyer, seller and agent workflow end to end: role selection → privacy agreement → registration → email OTP → company verification review → product/requirement intake → matching → LOI/FCO/SPA → nontransferable irrevocable DLC directly to seller → cargo tracking → destination SGS evidence → delivery → payment confirmation → referral commission / audit. Payment is never released automatically by UDC, and inspections/logistics remain party/partner responsibilities.
9. With opted-in test recipients only, exercise signed Meta inbound messages, 24-hour conversation expiry, old-number recovery, approved message-template discovery, sender permission proofs, blocked/unverified user access and STOP/revoked consent. Then separately exercise outbound notifications and Meta receipts **only after the owner approves enabling test sends**.
10. Exercise sender outages, unknown provider outcomes, retry/backoff/reconciliation, stale advisories, multiple cargo units, replays and email provider failures. Confirm confidential documents never enter logs or unapproved AI contexts.

## Disabled-by-default production gates

| Feature | Default / constraint |
| --- | --- |
| Real six-digit OTP mail | `UDC_AUTH_EMAIL_SEND_ENABLED` must stay false/unset; requires verified UDC-controlled sending domain and approved provider key |
| WhatsApp free-form permission evidence | `UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED` stays false/unset until Meta WABA/phone ID and real signed webhook tests |
| Shipment outbound WhatsApp outbox | No real worker or policy-approved send adapter is wired; no automated Meta sends even if a queue record exists |
| Overdue ETA reminder scanner | `UDC_ETA_FOLLOWUPS_ENABLED` stays false/unset until staging accepted; scanner creates in-app advisories, not verified physical delay claims |
| Meta template readiness screen | READ-ONLY WABA template statuses; does not send, approve or authorize templates |
| ImpexQ | Sandbox reference only; HSN/RoDTEP/calculator data are mocks; FTA eligibility unverified. Never treat provider reference as binding advice |
| AI/AKIF | Fail safely during model outages; customer registration and existing manual review cannot depend on paid AI availability |

## Go/no-go evidence

- **Pass:** Complete GitHub UDC verification + AKIF stack checks on the exact integrated commit, and isolated PostgreSQL migration compatibility + real authorization tests with fictional data.
- **Pass:** Database backup/restore drill and signed object URL permissions, role-based access audit, protected identity checks, data retention and company review permissions.
- **Pass:** Human acceptance for actual registered test WhatsApp number, email OTP delivery, password reset, same-account number migration, Meta approved template/status callbacks, in-app notification delivery and deal/shipment milestone visibility.
- **Pass:** Manual operational playbooks for unknown Meta delivery outcomes, email provider outages, expired SGS evidence, blocked trade financing, shipment data discrepancy, bypass/NCNDA review and security incidents.
- **No-go:** Unmerged or unreviewed code, failed CI, missing migration approvals, absent legal/privacy consent, a Meta API key without approved WABA/templates, unverified sending domain, user-data migration ambiguity, no backup/restore proof, or any feature that silently sends real customer messages.

## Deployment and rollback controls

**No production rollout has been authorized by these QA tests.**

Before launch, the owner signs off on the target staging/production service IDs, exact Git SHA, schema backups, DNS/sender ownership, known customer-data changes, and an abort/rollback plan. If a rollout fails, disable newly enabled email/WhatsApp send flags, stop scheduled scanners and outbox workers, route all affected onboarding or financial flows to human review, and roll application code back to the known-good release. Database migrations are **not guaranteed reversible**: use tested snapshot/restore or a reviewed forward-fix plan, not ad hoc `DROP TABLE` on live data. Preserve audit logs and notification/OTP history needed to investigate failures.

## What current CI proves

The combined release workflow runs the existing registration, consent, deal, AI, shipment, tracking, email/number recovery, Meta window, outbox, template readiness and admin checks against mocked external providers. The isolated migration runner applies exact email/auth and shipment/WhatsApp SQL in one randomly named loopback QA database and validates RLS, least privilege and idempotency. It does **not** prove live carrier feeds, paid AI reliability, actual inbox delivery, Meta message acceptance, a production-number handshake, external banking/SGS execution, or legal enforceability.

No live customers, production secrets, production PostgreSQL, Meta senders, or email senders should be used for this rehearsal.

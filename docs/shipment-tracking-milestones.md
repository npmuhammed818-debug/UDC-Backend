# UDC shipment milestone tracking — draft, not deployed

This is the event-history layer of UDC's WhatsApp-first shipment tracker. The external logistics partner and trading parties remain responsible for shipping, customs, inspection and payment. **UDC does not pretend to own physical GPS/AIS, carrier tracking or customs clearance.** Every shown event is a dated record supplied/reviewed by UDC's administrator.

## Core contract

- A shipment is created under an existing UDC deal and receives a `planned` event.
- Changing shipment status creates an append-only `status_update` event in the same transaction as the audit log. Identical status repeated does not create another milestone/alert. A PostgreSQL transaction advisory lock serializes status updates for the same shipment.
- Admin `POST /admin/shipments/:shipmentId/events` adds an explicit event. It requires a unique UUID `idempotencyKey`, one of `planned, booked, departed, in_transit, arrived, customs, inspection, delivered, delay, exception, status_update`, and a dated `occurredAt`. Optional `location` and `note` are admin-reviewed. `source` is `udc_manual` (default), `carrier_reported` or `document_checked`; latter two require a `sourceReference`. The source label indicates the reported source, not an independently authenticated third-party feed.
- The unique event key is stored in PostgreSQL. Repeating the same key/payload returns the existing milestone with 200 and no duplicate notification; changing payload with the same key returns 409. Validation errors are 400. Future event times (more than five minutes ahead) are rejected. Shipment access remains admin-only for writes.
- Buyer and seller can see full recorded details of their deal's events from `GET /deals/:dealId/tracking`. Agents with active assignment see event kind, timestamp and status, plus shipment ETA/status only; they do not receive carrier, reference, location, free-form note or inspector details.
- Verified users can open WhatsApp **My deals → Track shipment**. Buyer/seller see the latest three shipment summaries and five event milestones. Active verified agents see milestone stage/time only. Every request verifies account and current deal membership. All notifications for agents are generic; their source references and counterparty details are withheld.
- The existing buyer/seller notification mechanism sends recorded shipment updates; delay/exception event types use a distinct urgent notice. Verified active assigned agents receive generic milestone or delay alerts; revoked agents do not.
- No live carrier AIS/location estimates are fabricated. Recorded times are UTC, not real-time telemetry.

## RLS, migration and staging

The additive table and indexes are defined by `lib/db/src/schema/shipmentTracking.ts` and the **unapplied** SQL migration `lib/db/migrations/20261024_shipment_tracking_events.sql`. The migration enables RLS, revokes `anon` and `authenticated` grants, restricts `service_role` to SELECT/INSERT and forbids direct client policies. Audit writes and event writes occur in one transaction.

`drizzle push` in isolated CI is **not** evidence that the production RLS migration ran. Before live deployment, review exact migrations on a separate PostgreSQL fixture, then stage the migration with a DBA-approved backup/rollback path and security review. Production owner approval is mandatory.

## Coverage and remaining gates

Automated mocks verify cross-deal exclusion, anonymous and revoked-agent rejection, agent-only redaction, invalid carrier source, future time rejection, atomic event+audit rollback, status retries, request-key replay and payload conflict, and agent alert restriction. Existing regression/AKIF suites remain active.

Outstanding before launch: isolated migration smoke tests of exact SQL/RLS/unique key, production-grade event-delivery retries/outbox, multiple-container/vessel tracking metadata and reconciling the carrier's actual references, stale ETA/delay escalation, periodic notifications under recipient preferences, supported transport modes, real Meta webhook/WhatsApp interaction with approved number, and role/consent live acceptance. No production deployment has been authorized.

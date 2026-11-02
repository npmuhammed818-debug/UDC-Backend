# Fresh staging test and security pass 4, 2026-11-02

Scope: development release branch, synthetic local users and SQL, no real messages, no hosted SQL changes, no production deployment.

## Findings fixed

- Deal and company uploads were not atomic with their access/audit rows. A synthetic audit trigger failure returned 500 but left a document row and uploaded object behind. Upload rows, grants and audits now share a transaction; storage cleanup runs when that transaction fails.
- Deal, company and admin upload quotas used an unlocked count before upload. Concurrent requests could consume the same last slot. Each path now takes a transaction-scoped, per-user advisory lock through the quota check and insert. Admin and trader deal upload paths share the same lock namespace.
- Storage is external to PostgreSQL. Cleanup is attempted, not a distributed transaction guarantee. A cleanup failure emits a fixed, non-sensitive warning for operator review.

## Executed proof

- Release verification: 618 API tests, repeated by the API build; typechecks, frontend build and API build pass.
- 65 Python tests and 2 additional JavaScript tests pass.
- All 19 PostgreSQL suites executed on isolated loopback PostgreSQL, with fresh disposable databases. This includes the new pass-4 suite.
- Pass 4: all 150 mounted admin routes deny anonymous, buyer, seller, agent and outsider sessions (750 negative requests). Also tests outsider IDs, agent access, invalid uploads, injected upload audit failures, company/deal/admin concurrent quotas, suspended accounts and revoked sessions.
- Existing signed webhook retry/crash, durable dedup, shipment delivery and receipt suites pass with simulated provider responses.
- Commission proposal suite: 8 concurrent human approvals produce one liability and audit; changed terms, suspension, non-admin/unconfirmed approval and injected audit failure remain blocked.
- Exact email migration review, shipment/role migration review and real pg_dump/restore of 14 selected tables pass again. This is local evidence, not hosted project recovery.
- Feature acceptance groups pass; generated contracts unchanged; dependency audit reports zero advisories.

## Rollout gate confirmed

Read-only Render inspection showed Production UDC-Backend on main uses AKIF_WORKER_URL=https://udc-akif-worker.onrender.com. Therefore the shared worker is not staging-only. Its logging fix remains undeployed pending explicit production-impact approval or separation. No production setting was changed.

Sources:
- https://dashboard.render.com/web/srv-das1m87avr4c738l4se0/env
- https://dashboard.render.com/project/prj-das1m7ojo6nc739rtqm0
- https://dashboard.render.com/web/srv-das5d4ojo6nc73a9h250

Hosted object policies, backup/restore and provider retention, real-provider delivery and multi-person acceptance remain separate unverified release gates. Passing these synthetic tests is not a claim that the service cannot be compromised.

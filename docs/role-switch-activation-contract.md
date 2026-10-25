# Role-switch activation: implementation contract (pre-staging)

Status: DESIGN / NOT IMPLEMENTED / NOT APPROVED FOR DEPLOYMENT.
Base: `49972b50b775372ce56e65bd7a27979c25d32c33`.
Scope: Plan A MVP. The existing role-change endpoint only records `reviewed` or `rejected`; neither grants access.

## Account and permission model

- One stable user ID and email identity; one **active** Buyer, Seller or Agent role at a time.
- A separately recorded set of **approved eligible roles** is needed before users can switch back and forth. An approval is not activation. Never infer eligibility from an old pending/reviewed request.
- An admin approves the target role only after target-role KYC/eligibility review. Preserve original identity, consents, documents, historical deals, referrals, commission entitlements, audit trails and ownership.
- Role switch must never silently change party ownership, payee, assigned agent or referral attribution. Existing obligations stay attached to immutable user ID, but access to restricted active-deal actions must be explicitly checked; block switching when unresolved obligations cannot be safely serviced.
- Never use `users.role` update as the only authorization step. Audit all permission paths that use canonical role, role-specific tables, cached role/session/WhatsApp state and deal assignments.

## Transactional activation API

Implement a distinct admin-only `approve` transition and a user-authorized `activate` operation, not an alias for existing `reviewed`.
1. Lock user and request/role eligibility rows in a fixed order, check verified status, request state, current active role, target eligibility, and no disqualifying active obligations.
2. Store approved target eligibility and review evidence without changing active role; never trust a WhatsApp role button as KYC.
3. On activation, atomically switch active role, write immutable audit with old/new role and actor, revoke all browser sessions, invalidate role-bound conversation/intake state and rotate any role-bound credentials. Require fresh authentication/reentry. Never clear historical records.
4. Concurrent activations and duplicate webhooks must be idempotent; stale approval cannot activate against a changed user. Database failure rolls back all state.
5. Add an explicit recovery/reversal workflow. Reversal is a new audited transition, not a direct edit or history rewrite.

## Mandatory verification before deployment

- PostgreSQL tests: two concurrent approvals/activations; stale and duplicate requests; unverified/suspended users; reviewer spoofing; transaction rollback; session revocation; pending obligations; old-role route denials; new-role grant; immutable history/referrals/commissions.
- WhatsApp tests: verified account chooses role, unverified role blocked, menu reflects active role only, switching interrupts ongoing intake safely, cross-number same-email account remains one identity, retries don't double activate.
- Browser tests: role state refresh and forced re-login; no old cookie retains old-role permissions.
- Security review: inspect every `users.role` consumer and background job; ensure no leaked old-role documents, agent assignments or buyer/seller data.
- Migration: additive, RLS/grants reviewed, staging dry-run, rollback, full DB + Storage backup/restore and least-privilege TLS verification.
- No merges, staging/production deployments, migrations, real sends, or provider activation without founder approval.

## Open policy gate

Founder requested completion before staging; recommended product rule is one active role at a time with multiple separately approved eligible roles. Before enabling activation, approve how to handle a user with open deals or active agent assignments. Default is **block activation and refer to admin** rather than abandon obligations or leak access.

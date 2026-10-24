# UDC role-change review — draft QA, no automatic privilege grant

UDC currently assigns one canonical `users.role` to each account. A verified user may need to become a buyer, seller or agent later, but simply overwriting this value could accidentally grant access to old deal rooms, referrals, company documents, banking details or agent commissions.

This feature adds an explicit and reviewable **request** pathway, not an unsafe automatic role switch:

1. A verified existing WhatsApp user selects `More options → Change role` and chooses Buyer, Seller or Agent, or types `Switch me to Agent` (similarly Buyer/Seller).
2. The signed and consent-checked WhatsApp webhook authenticates the phone. The role request handler rechecks the current verified user in PostgreSQL inside a serializable transaction; no supplied user ID is trusted.
3. One `pending` request per user is stored with the original role, requested role and creation timestamp. Duplicate/replayed clicks do not create extra requests or audits. If audit insertion fails, the transaction rolls back.
4. An authorized admin can review the non-sensitive queue through `GET /api/admin/role-change-requests`, and record `reviewed` or `rejected` with a short note through `POST /api/admin/role-change-requests/:requestId/review`. These actions are audited and send an in-app notification, not an unsolicited WhatsApp message.
5. **Neither action updates `users.role`, verification status, current phone, browser sessions, deal participants, company access grants or commissions.** A reviewed request is **not** a granted role. The response says this explicitly.

The private `user_role_change_requests` table has RLS on; anon/authenticated client roles have no table grants; the backend service role gets only SELECT/INSERT/UPDATE. A partial unique index prevents multiple pending requests for one user. Reviewed requests require a reviewer ID and timestamp. The migration is additive, unapplied and tested only on disposable PostgreSQL.

**Remaining design/launch gate:** Account switching across buyer/seller/agent is not yet fully implemented. Before enabling actual multi-role access, design separately approved role assignments or profiles and prove that old deals and documents never become available in a new role. New buyer/seller roles must satisfy company verification; agent roles need referral/commission isolation. Existing trade activity and unverified documents cannot be silently converted. Any role activation must revoke incompatible sessions and stale WhatsApp context, log the event and pass human acceptance.

This PR contains **no merge, deployment, production DDL, provider sends or role activation**. Do not represent a request as completed role switching.

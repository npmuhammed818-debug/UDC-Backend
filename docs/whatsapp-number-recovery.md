# Same UDC account on a new WhatsApp number — draft QA feature

**Not deployed.** No live database migrations, Render changes, outgoing OTP emails, or Meta messages are authorized by this change.

## User flow
1. The customer gives privacy consent from the **new WhatsApp number**.
2. They send `Sign in owner@example.com` or `Recover account owner@example.com`.
3. If that exact email is already owned (previously verified), the account is eligible, and the destination phone has no other account, UDC sends a **6-digit OTP** to that registered email. The WhatsApp response never confirms whether an account exists.
4. The customer replies `Phone code 123456` **from the same signed WhatsApp number**, within 10 minutes. Only the actual issued code works.
5. The original `users.id` stays unchanged. The old WhatsApp number is unlinked, outstanding browser sessions revoked, and old transient WhatsApp drafts removed. All existing deals, company review, audit history, role and agent referrals remain attached to the same user ID.

This is an exclusive **number change**, not two numbers simultaneously sharing one session. The old number loses access. A number already tied to another UDC account must go through manual identity review; UDC never merges accounts because two profiles share an email.

## Security invariants
- Signed Meta webhook, per-number privacy consent and suspension gates execute **before** account recovery commands. Invalid commands and codes must not reach Akif, AI prompts, memory or trade intake.
- Never match/rebind accounts based on the address entered alone. The current email must have both `verified_email` matching the account email and a nonnull `email_verified_at`. For older unverified emails when the original number is lost, UDC must use manual recovery.
- Code HMAC is purpose-specific (`link_phone`), bound to the immutable account ID, email, target WhatsApp number and challenge UUID, with no plaintext code stored. Constant-time comparison, at most five guesses, 10-minute expiry and single-use transaction.
- Per-phone/IP budget from existing `email_auth_limits`; per-account 5 sends/hour and 60-second resend spacing. Generic response for unknown/unverified/suspended accounts or existing phone collisions.
- Lock the target phone and source user before checking and reassigning it. A second number change after issuance invalidates stale challenges. Successful recovery consumes other pending challenges and revokes old browser sessions.
- RLS is enabled on the additive recovery table; `anon`/`authenticated` have no table grants and no policies. Service-role privileges are explicitly limited to SELECT/INSERT/UPDATE/DELETE.
- Saving or executing this migration on production requires a separate approved migration plan and backup/rollback validation. `drizzle push` does not install this SQL. Real email transport is still disabled and fails closed; mocked delivery is not proof of launch readiness.

## Testing and review gates
- Isolated tests cover the parsing boundary, unknown/unverified emails, correct six-digit recovery, old-number revocation, replay, five wrong attempts, account conflict, provider outage, changed old number and unchanged user ID.
- Signed webhook tests ensure Meta signature, privacy consent, account suspension and non-AI routing.
- **Still required before release:** isolated PostgreSQL integration for the exact migration and real transaction locks; two simultaneous competing target numbers; alternate-number email binding/replay; real registered sender/Meta delivery in staging; safe sender and email provider approval; backend UI end-to-end acceptance; privacy/deletion review for old transient drafts and audit data.

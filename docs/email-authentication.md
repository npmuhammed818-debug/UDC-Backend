# Email ownership and password recovery (draft, not deployed)

Branch `feature/email-verification-recovery` starts at main `91c59e9`, independently
of #124. #124 is frozen for deployment review; #123 remains separate. No production
migration/configuration, customer record or outbound email was changed.

## Existing authentication and eligibility

Web registration uses scrypt passwords and initially pending accounts. WhatsApp
registration also stores a scrypt hash, but of a generated unknown secret; a hash
alone is therefore not evidence of a customer password. Existing email/password
sessions, manual company approval, privacy consent and role rules remain in place.

New web registrations explicitly set `password_recovery_enabled`. Legacy records
remain false until a successful existing-password login proves eligibility. There
is no speculative migration/backfill, and email verification alone never enables
a password. A legacy operator who has already lost their password and has not
enrolled cannot self-enroll through recovery; use the separately authorized human
account-recovery process, without bypassing identity checks.

Ownership is stored as `verified_email` plus `email_verified_at`, and applies only
to that current email address. Verification neither approves a company nor changes
role/status. It is not a new global login gate for existing accounts. Self-service
password recovery requires both actual password eligibility and prior ownership
verification of the current email. These are separate from company verification.

## Customer/admin flows

- In a consented, registered WhatsApp chat: `Verify email`, then `Email code 123456`
  using the code received by email. These commands run after signature/consent/block
  gates and before AI, deal relay or memory. Codes are not forwarded to a model.
- A signed-in browser user can request/confirm ownership from the verification
  panel. No email is sent automatically on page load, login or registration.
- Existing password users can select “Forgot your password?” on `/login` and use
  `/password-recovery`. An eligible email receives a code; completion requires a
  strong replacement password. There is no auto-login. All previous sessions and
  outstanding codes are revoked in the password-change transaction.
- Browser email changes require the current password (including legacy sessions).
  WhatsApp-only users change profile details through their authenticated WhatsApp chat.
  Changing an email invalidates proof and outstanding codes, including change-away
  and change-back. A database trigger also covers changes outside this API.

## Protocol and abuse controls

- Cryptographically random eight-digit codes, including leading zeroes; ten-minute
  expiry; keyed HMAC at rest bound to user, exact email, challenge UUID and purpose.
  The HMAC uses the server's existing `SESSION_SECRET` (at least 32 characters).
- Constant-time digest comparison, five guesses per challenge and atomic single use.
  A resend invalidates older codes for that purpose. User row locks serialize
  issuance, consumption, email/password changes and password login/session creation.
- Durable, pseudonymous database counters: at most five sends per user/purpose per
  hour, with at least 60 seconds between sends. Per-IP limits are ten requests and
  twenty confirmations per fifteen minutes; malformed/unknown requests count too.
  Counters survive worker restarts and work across API replicas. Client IP handling
  retains the existing Express trust configuration: never trust arbitrary forwarded
  headers. Review the actual reverse-proxy boundary before production rollout;
  a shared proxy address may cause conservative shared-IP throttling.
- Recovery requests return the same generic 202 shape for unknown, passwordless,
  unverified, blocked, cooldown-limited and delivery-failed accounts. Dummy random
  challenge IDs do not prove eligibility. Delivery is bounded to two seconds with
  an abort signal; a 2.5-second recovery-response floor masks normal provider latency.
  Database stalls can still affect timing; do not claim perfect timing anonymity.
- Invalid/expired/replayed proof has one generic error. No code/hash/password/provider
  details are returned or logged. New tables have RLS and client grants revoked;
  generic user-input schemas cannot set ownership or password eligibility.
- Old challenge rows expire and are deleted after a further day; rate windows older
  than two days are removed during subsequent IP-budget checks. Audit events retain
  only the actor/action/entity, never codes or email/password material.

## API

All paths use `/api` prefix, JSON bodies and `Cache-Control: no-store`.

| Path | Input | Result |
| --- | --- | --- |
| GET `/auth/email/status` | Existing authenticated session | `emailVerified`, `passwordRecoveryEnabled` |
| POST `/auth/email/verification/request` | Authenticated; `{}` | 202, challengeId, expiry seconds, generic message |
| POST `/auth/email/verification/confirm` | Authenticated; challengeId, code | Ownership confirmed; no company approval |
| POST `/auth/password/recovery/request` | email | Generic 202 regardless of eligibility |
| POST `/auth/password/recovery/confirm` | email, challengeId, code, password | Password changed and sessions revoked; sign in again |

Errors: 400 invalid input/proof, 401 missing verification session, 403 blocked account,
429 IP/request limit with Retry-After, 503 generic unavailability. Authenticated
resend limits can return 429; public recovery never discloses per-account limits.
The same 12–128 character strong-password schema is used for registration/recovery.
OpenAPI and generated client/Zod declarations are updated together; the generator
explicitly targets the installed Zod 3 root export.

## Delivery and rollout gate

**No real email transport is installed or enabled.** `sendAuthEmail` fails closed
without logging or sending codes. Tests replace that module at bundle time with an
in-memory provider; production has no test recipient override, debug-code endpoint,
console transport, provider credentials or mock mode switch. Delivery failures
invalidate issued codes. A future reviewed provider must accept the abort signal.

Before any deployment, obtain owner approval for the mail provider/sender and
production configuration, and review/apply
`lib/db/migrations/20261023_email_authentication.sql` through the normal migration
process. `drizzle push` alone does not install the RLS/grant changes or email-change
trigger. Do not run it against production as an alternative to the migration.
Preserve the session secret; do not rotate it casually to enable this feature.
Review legacy operator enrollment and test real delivery only with separately
approved recipients. No purchase or service upgrade is authorized by this PR.

## Automated evidence

- `pnpm run release:verify` and `pnpm run acceptance`: full existing regressions,
  typechecks/builds and new cryptographic/input/default-provider/deadline tests.
- `email-auth-postgres` CI job uses an isolated PostgreSQL service. It applies the
  migration twice for idempotency, uses actual routes, scrypt, sessions, transactions,
  concurrency and RLS/trigger metadata, and replaces all mail with a memory mock.
- Local equivalent after initializing the dedicated fictional database schema:
  `UDC_EMAIL_QA_DATABASE_URL=<loopback-udc_qa_email_database> node artifacts/api-server/test/integration/email-auth-postgres.mjs`.
  The runner rejects remote hosts, host overrides and non-QA database names.
- The webhook fixture checks signature/consent/suspension gates and that email-code
  commands never reach AI/intake/memory. PostgreSQL checks cover bound digests,
  expiry, resend/guess/hourly/IP limits, replay/concurrency, email changes, blocked
  users, legacy proof, WhatsApp password exclusion, safe delivery failures and
  atomic old-session revocation, including a concurrent old-password login.

Passing mocked checks is not proof of real mail delivery or full MVP acceptance.

Local pre-PR evidence: 203 backend checks, all eight overlapping acceptance groups,
release/typechecks/builds, and 20 real-PostgreSQL scenarios passed. A Chromium
walkthrough with mocked local API responses passed verification/recovery success,
delivery failure, wrong code, resend cooldown, generic request message and sign-in
handoff, without browser errors or external requests. Browser evidence is local;
the committed CI job covers real backend/SQL behavior with mocked email instead.
Hosted CI links and the tested revision are recorded in the draft PR.

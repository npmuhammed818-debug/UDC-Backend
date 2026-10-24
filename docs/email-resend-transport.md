# UDC six-digit OTP mail transport — Resend adapter (DRAFT, NOT ENABLED)

This optional adapter is **off by default** and will stay unapplied until UDC approves a sender domain, a non-production staging test and a deployment. It extends the existing email verification, password reset and verified-email WhatsApp number-recovery feature from Draft PRs #127/#129. It does not replace account/company approval or weaken the required OTP verification.

## Provider choice and sender identity

The optional provider adapter uses Resend's HTTPS POST `https://api.resend.com/emails` endpoint. This is **not the Polsia mail inbox**. The email address used for sending must belong to a **domain UDC controls and has verified for sending in the Resend dashboard**. Merely owning or receiving email at `@polsia.app` does not establish authorization to send from that domain. Do not substitute an unverified sender or a third party's domain.

Before enabling, the owner must verify DNS records / a sending-enabled status in Resend, review terms/pricing/data processing, and approve the sender. Reference: https://resend.com/features/email-api, https://resend.com/changelog/idempotency-keys

## Required server-side configuration (do not paste secrets in chat or GitHub)

| Environment variable | Required value |
| --- | --- |
| `UDC_AUTH_EMAIL_TRANSPORT` | `resend` |
| `UDC_AUTH_EMAIL_SEND_ENABLED` | `true` **only after owner approves real email sending**; unset or false until then |
| `RESEND_API_KEY` | Secret API key stored only in private hosting environment |
| `UDC_AUTH_EMAIL_FROM` | Approved sender, e.g. `UDC Security <otp@your-verified-domain.example>` |
| `UDC_AUTH_EMAIL_VERIFIED_DOMAIN` | Exact verified sender domain as confirmed in provider dashboard |
| `SESSION_SECRET` | Existing strong session secret (32+ characters); **do not rotate to enable this feature** |

The adapter accepts an OTP only if it has exactly six numeric digits, a valid recipient email, a currently valid expiration date and a known purpose: `verify_email`, `reset_password` or `link_phone`. It creates **text-only** OTP messages with a 10-minute expiry notice, no marketing, links, HTML, documents or tracking pixels.

## Safety behavior

- Credentials or sender domain missing, mismatched, disabled or invalid: fail closed. There is no console OTP fallback, debug endpoint or recipient override.
- Fixed HTTPS provider endpoint; server-side API key never reaches the client. Requests use `Authorization: Bearer` over HTTPS, no redirect, no-referrer and the existing bounded `AbortSignal`.
- Idempotency key is a keyed HMAC of the recipient, OTP, purpose and expiry. It contains no raw OTP/address and changes when a new code is issued. Resend documents a 24-hour idempotency retention window; UDC does not automatically retry ambiguous timeouts.
- Provider reply must contain a bounded (4 KB) JSON receipt with an accepted UUID-like provider ID. Error messages, response bodies, identifiers, SMTP/provider diagnostics, codes and addresses are never logged or returned to clients.
- Acceptance from Resend means the send request was accepted, **not that the recipient's inbox received it**. Existing OTP issuer invalidates a challenge if the email submission fails or times out, preserving generic account-recovery responses.
- No live provider calls run in GitHub CI; all tests inject an in-memory fake HTTP transport.

## Remaining staging and production gates

1. Choose an authorized UDC-controlled sending domain. Verify required DNS records and enable sending on Resend, or switch to an alternative reviewed email provider.
2. Confirm company transactional sender, account ownership, compliance, terms, billing, bounce/delivery diagnostics, and mail rate limits with the owner.
3. Review staged additive auth migrations and user/password legacy behavior; test with **explicitly approved fictional test recipients** before enabling UDC customer accounts.
4. Test code expiry, lockouts, resend cooldowns, password reset revocation, same-account WhatsApp number recovery, repeated sends and provider outages with real staging mail.
5. Only after passing tests, the owner may approve the production mail transport enablement and deployment. This branch does **not** enable production mail.

**No secret, production deploy, real recipient mail, provider account setup or live database change was made.**

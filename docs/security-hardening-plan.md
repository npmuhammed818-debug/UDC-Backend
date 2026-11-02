# UDC security hardening - running list (2026-11-02)

## Fixes shipped (staging branch dev/rc-20261026, all gates green)
1. 310fdaa - Per-account password login budget: 10 fails / 30 min via durable email_auth_limits (no migration). Kills IP-rotation brute force. +4 tests.
2. ce36b2c - CORS deny-by-default: only CORS_ALLOWED_ORIGINS entries get headers; same-origin + server-to-server unaffected. +3 tests.
3. ee685fe - Final error handler: fixed generic JSON (internal_error / invalid_request_body / request_too_large); no stack traces to clients in any NODE_ENV. +5 tests.
4. 0f1ea6e - WhatsApp media download: URL must be https on a Meta media host before the access token is attached (token exfil guard). +3 tests.
5. 16d1a03 - trust proxy exactly 1 hop: per-IP auth budgets key on the real visitor (was the Render LB for everyone - site-wide lockout risk). +1 test.
6. 4f3bec8 - AKIF worker URL must be https (loopback exempt): worker token + chat content never cleartext. +4 tests.

## Red-team report 1 fixes (commit 3ad8cf3, 560/560 green)
7. Login budget race (MED): budget charged atomically inside the account row lock before verification; cleared on success.
8. Lockout DoS (MED): OPEN - options sent to owner (A keep / B email+network pair + daily cap, recommended / C email-code unlock).
9. WhatsApp sign-in phishing (LOW-MED): OPEN - proposed confirm message shows requester IP + UTC time, 2-min code TTL; awaiting wording approval.
10. Web auth IP budgets (LOW-MED): durable (email_auth_limits), IPv6 /64 keyed, expired rows purged; in-memory Map removed.
11. Upload quotas (LOW): 20/day deal docs, 10/day company docs per user.
12. Budget table fill (LOW): unknown emails write no rows; timing equalized with a dummy scrypt hash.
13. Register 409 enumeration (LOW): OPEN - recommend keeping (standard UX); login/OTP already equalized.
14. Agent company creation (LOW): POST /company rejects agents. Agent tracking access was a false positive (redacted by design, test-enforced).
15. Security headers (INFO): nosniff, X-Frame-Options DENY, Referrer-Policy no-referrer, HSTS. CSP deferred (SPA + vault page use inline script/style).
16. Production tester-mode env check (INFO): relayed to owner; we never touch production env.

## Verified safe (deep sweep, no change needed)
- Sessions: 32B random, HMAC-SHA256 at rest, 7d TTL, revocation; password reset revokes all sessions.
- Registration: role enum buyer/seller/agent only; no admin self-assign; strict schema; phone never settable.
- Login/OTP: per-IP durable budgets (send 10/15min, check 20/15min), per-account send 5/hr + 60s spacing, attempt caps, timing-equalized, no enumeration.
- Webhook: HMAC-SHA256 + timingSafe, per-message-id dedupe (replay), per-sender caps, status callbacks only from configured phone id, aadhaar auto-refusal.
- Buttons/interactive: sender-scoped deal selection; unknown ids rejected.
- Admin: all 79 routes requireRole("admin"); incidents/grievances/role-change/template-readiness admin-gated; scheduler endpoints key+timing-safe.
- Payments/commissions: admin-only, advisory locks, duplicate checks, evidence gates, audit logs, currency precision guard.
- Deals/documents: dealAccess scoping everywhere, PDF magic bytes + 5MB, UUID paths, documentAccess join for reads.
- Vault uploads: 128-bit tokens, hashed at rest, single-use, 15-min TTL, magic bytes, 8MB; log path redacts tokens.
- Profile: strict schema, email change requires password, resets verification, consumes pending challenges.
- AI: outbound placeholder guard, memory formatted as quoted data (never instructions), lesson safety (identifier/injection screening), voice per-user daily caps + worker global cap.
- AI drafts (SPA/LOI/ICPO/FCO/NCNDA): template-built from structured deal data, confirmTerms required, draft_for_review status.
- Secrets/logging: query strings stripped from request logs, vault paths redacted, no token/password logging found.
- Health endpoints: no version/env disclosure.
- CORS/auth cookie: httpOnly, sameSite=lax, secure in prod.
- SQL: drizzle parameterized; no sql.raw; zod strips unknown keys (mass-assignment safe).
- Frontend: single dangerouslySetInnerHTML is static CSS from dev config (shadcn chart).
- Dependencies: pnpm audit = 1 moderate (minimatch <11.0.1) in orval/typedoc build-time chain only; not runtime-exploitable; left as-is.

## Firewall note
- lessonSafety.ts comment "Owner rule: clean or none" flagged as unverified authority claim; traced to PR #268 merge in repo history, restates the chat-approved lesson-review rule. No action.

## Remaining / next
- Red-team agent: independent adversarial verification of the above (request from parent).
- Then: admin web pages (LAST item per owner).
- Kaggle v10 chain wake fires 2026-11-08 09:00 PST (separate workstream).

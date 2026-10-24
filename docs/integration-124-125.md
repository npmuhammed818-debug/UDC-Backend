# Temporary integration of #124 and #125

Review/testing only. No merge to main, deployment, actual mail, paid service,
production data/configuration or secret change is authorized.

| Input | Exact revision |
| --- | --- |
| Latest main at preparation | `91c59e93abd9bd104b6c89ef52be2255210f630e` |
| Frozen #124 | `6c8f238db4ec0c6243d2d2a27438e156080f9192` |
| Frozen #125 | `ea1df535665822d777c20082cc1c079a94a635d3` |

Branch `integration/mvp-124-125` merges both exact heads into a temporary branch
based on main. Neither source branch/PR is edited. TLS #123 remains separate at
`232efa1f6d9433c2d8fcd775141a10969d8d8ec7`; database TLS code is identical to main.
The email SQL migration and default disabled mail adapter remain byte-for-byte #125.

## Conflict resolution and source review

Two textual conflicts occurred:

- `.github/workflows/ci.yml`: preserved #124's release diagnostics, all Python
  worker/extractor checks, real PostgreSQL WhatsApp scenario, acceptance and required
  hidden artifacts; retained #125's separate PostgreSQL email-auth job. Added the
  isolated migration-review job and included the signed WhatsApp transcript in artifacts.
- `docs/mvp-launch-readiness.md`: kept #124's current scoped checklist, replaced
  the obsolete “missing” OTP/recovery rows with #125's implemented-but-mail-disabled
  status, and retained the live acceptance/migration/provider prerequisites.

Webhook, guided registration and webhook test overlaps auto-merged and were
reviewed. Signature/consent/block gates precede email-code handling; codes bypass
AI/intake/deal memory; guided outage answers and registered-role validation remain.
Rejected drafts still require the saved audit nonce before deletion. Authentication,
profile reauthentication, `/password-recovery`, verification UI and generated API
contracts come from #125. #124's deterministic shared-deadline test is retained.

Integration-only code additions are test infrastructure, not production behavior:
the signed WhatsApp fixture applies the exact migration in its isolated QA DB,
intercepts mail at bundle time, then verifies ownership before resuming normal
trade intake and all cross-role checks. No runtime mock-mail switch was introduced.

## Local evidence

| Check | Result and scope |
| --- | --- |
| `pnpm run release:verify` | PASSED: 212 backend tests, typechecks and frontend/backend builds |
| `pnpm run acceptance` | PASSED all eight regression groups, including admin controls; group counts overlap |
| Full worker + extractor pytest | PASSED 25 tests; existing Starlette/AnyIO deprecation warning |
| Real PostgreSQL signed WhatsApp | PASSED buyer/seller/agent outage registration, email proof and replay, buyer requirement, duplicate submit, two seller offers, rejected-email correction, all four cross-role intake denials |
| Real PostgreSQL email auth | PASSED 20 scenarios: expiry, guesses/resends/hourly/IP limits, user/purpose binding, concurrent one-time use, password recovery/session revocation, concurrent old-password login, blocked/passwordless/legacy accounts, email changes and safe delivery errors |
| Exact SQL migration on isolated legacy schema | PASSED nine review scenarios; see linked review |
| Local real admin browser + PostgreSQL | PASSED fictional admin login, three pages and 20 admin GET endpoints; pending buyer denied all 20 and admin UI, self-registration cannot grant admin, HttpOnly cookie, logout revocation; no page errors or HTTP 5xx |
| Local mocked email browser flows | PASSED verification/recovery, safe delivery error, invalid code, cooldown, generic request message and sign-in handoff; no external requests/browser errors |

Browser checks are local evidence; backend/SQL/worker/acceptance regressions run in
hosted CI. The integration PR records the exact final head, CI run and artifact
metadata after completion. Green regression tests do not establish live acceptance.

## Remaining risks and deployment prerequisites

See [migration security and lock review](email-migration-review-124-125.md).
Actual sending is disabled; approve/review a provider and sender before separately
authorized testing. No real emails have been sent. Review actual backend DB role,
RLS/grants and proxy/IP classification; legacy operators need password/email enrollment.
Use an approved migration run with bounded lock/statement budgets and a low-traffic
window; the SQL alone has no such budgets and must not be called zero downtime.
Decide whether to narrow trusted `service_role` GRANT ALL to required DML permissions.
Do not use `drizzle push` alone: it omits migration RLS/grants/trigger behavior.

Real Meta delivery, live AI quality/languages, production Supabase/storage/RLS,
complete multi-party/business acceptance and actual SMTP/provider delivery remain
NOT YET TESTED here. Production pooler TLS remains blocked on its confirmed hostname;
#123 is not included. Obtain explicit owner approval before any merge, deployment,
production secret/configuration change or live-email test.

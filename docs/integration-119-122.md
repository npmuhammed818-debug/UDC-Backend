# Temporary integration: #119–122

Prepared 23 October 2026 on `integration/mvp-119-122`, based on latest main
`91c59e93abd9bd104b6c89ef52be2255210f630e`.

| PR | Exact selected head | Scope |
| --- | --- | --- |
| #119 | `72366c01d7ebb8ecef4a3b4845e6e3691e70e85e` | Registration during model outages |
| #120 | `f27928f003d35ad413d553c36132f02cb068b292` | Retain rejected registration drafts |
| #121 | `91222ae04d2889f1608f3d494e6b045f0643a362` | Shared model fallback deadline |
| #122 | `8e01dda12725ec4669d74bf6f3f7e72ce3e7b767` | Registered-role trade boundaries |

All four cherry-picks applied without manual conflicts. PR #123 is excluded:
no database connection code, TLS test or acceptance-runner changes from it.
This branch is for review/testing only; no merge, deployment or production change
is authorized. Main remains unchanged.

## Local results

- **PASSED** `pnpm run release:verify`: typechecks, 205 backend tests (zero skipped), frontend/backend production builds.
- **PASSED** `PYTHONPATH=services/akif-worker:. python -m pytest services/akif-worker/tests services/document_extractor/tests -q`: 25 worker/extractor tests. One Starlette/AnyIO deprecation warning.
- **PASSED** `UDC_QA_DATABASE_URL=<isolated-loopback-test-db> node artifacts/api-server/test/integration/whatsapp-buyer-postgres.mjs`: actual Express signed webhook and PostgreSQL persistence, synthetic participants, intercepted outbound messaging and simulated failing providers.
- **PASSED** `pnpm run acceptance`: all eight groups. Group counts overlap; do not sum them or treat them as customer acceptance.

The PostgreSQL scenario covers consent, buyer/seller/agent registration, pending
human company review, buyer requirement, duplicate submit, two seller offers,
kg/AED answers without model calls, email conflict retention/edit/retry, unchanged
existing identity, and buyer→seller, seller→buyer, agent→buyer/agent→seller
permission failures without trade or intake-memory writes. Outbound messages are
restricted to generated fictional sender numbers; unexpected network calls fail.

## Hosted CI and limits

The draft integration PR runs these checks together in `UDC verification / verify`;
its `sow-regression-report` artifact contains acceptance reports and Python JUnit.
Consult the check attached to the current PR head for the hosted outcome.
The separate Akif workflow also runs its existing smoke subset.

These checks do not establish real WhatsApp delivery, production provider quality,
Supabase compatibility, real private storage/RLS or complete persisted workflows
for every MVP feature. See the current checklist for missing implementation,
particularly email OTP and email password recovery. No live customer data is used.

Next: review the combined hosted result, investigate remaining live-access gaps,
and request owner approval before any merge or deployment. Keep #123 separate.

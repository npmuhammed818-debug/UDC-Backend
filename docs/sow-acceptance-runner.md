# Repeatable SoW acceptance

Run `pnpm run acceptance` from the repository root. It groups isolated regression suites by the eight SoW sections and writes JSON and Markdown under `.acceptance-results/`. CI uploads the reports. Uncovered workflows stay explicitly uncovered. Green regression results are not production acceptance. Test subprocesses receive no production credentials.

## Synthetic live model probe

Set `UDC_ACCEPTANCE_RUN_ID` to a unique 8–80 character identifier. At startup a transactional advisory lock and audit-log claim allow only one run for that ID across restarts. A separate child receives only the existing worker URL/token and PATH. It receives no production database, WhatsApp, storage or paid-provider credentials and has no persistence or notification clients.

It exercises the actual intake prompt/parser against the existing worker with synthetic copper and sugar inquiries: five calls maximum, 65 seconds between calls, no retries or paid fallbacks. Provider/validation failure stops the run as blocked. The parent enforces a seven-minute deadline. Only fixed case names, failed field names and statuses enter logs/audit records, never model text or credentials. Remove the run ID to disable. Reusing an ID never reruns it; a new ID authorizes a new bounded test run.

This checks extraction and unnecessary questions. Separate isolated regression tests cover signed webhook routing, duplicate protection, term merging and actual writer mappings. It does not prove Meta delivery, real PostgreSQL transactions, human verification, document authenticity or completed trades.

## Trade terms retained

WhatsApp buyer drafts/submissions preserve supplied specification/grade, contract duration, inspection requirements and delivery timing. Delivery timing uses existing additional conditions. Seller drafts/submissions preserve specification, availability/delivery timing, monthly capacity, MOQ and inspection terms. No database column migration is needed. DLC/destination SGS policy remains fixed; submissions stay pending admin review.

## Remaining gates

End-to-end acceptance remains for all registration roles and verification, two-party matching/deal rooms, documents/voice, referrals/payouts, verified-party meetings, shipment/customs/delivery/feedback, and admin permissions/analytics. The report tracks these gaps rather than equating individual code checks with the whole SoW.

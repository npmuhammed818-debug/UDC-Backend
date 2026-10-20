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

## Live finding: quoted numeric facts (20 October 2026)

Synthetic copper probes reached the worker successfully (HTTP 200), but the returned quantity and target price failed numeric schema validation. Intake now normalizes only exact decimal strings and correctly grouped thousands separators. Units, scientific notation, booleans, empty/negative/zero values and malformed grouping remain rejected. The prompt explicitly requests JSON numbers. A live retest is required before calling the issue resolved in production.

## Operations coverage added

Deal operations now exposes the existing inspection, shipment and customs records. Participants can view their authorized meetings, tracking, customs, cases and reviewed feedback, and completed counterparties can submit feedback for review. Inspection/shipment creation writes an audit record atomically and notifies counterparties. Route fixtures cover payment evidence ownership, destination confirmation, completion-gated payout recording, customs upserts and review-gated feedback.

Commission creation can calculate from an explicitly confirmed agreed percentage or per-MT rate, as well as a fixed amount. Exact decimal arithmetic rounds once to cents. Calculated rates use the deal currency; unknown unit conversions and mismatched supplied totals are rejected. A per-deal/beneficiary transaction lock protects duplicate agent rewards. No rate is invented and no bank transfer is executed. Automatic creation of new liabilities from a referral alone is not implemented: a human must record the agreed commission rule.

## Follow-up live finding and registration

The five-case live run after numeric normalization passed all four buyer cases: complete copper/Jebel Ali, grade/delivery timing, missing-fact restraint and a contextual follow-up. The seller case was blocked by a buyer-only deliveryTime field in the wrong type. Intake now validates/persists only the fields allowed for the returned role; seller availability remains a separately validated text field. A further live run is required.

Explicit WhatsApp agent/broker registration now creates one pending profile and a review notification after consent, without a model call. Repeated requests preserve status; existing trader roles never change automatically. Web registration now puts every role, including agents, into pending human review. Registration fixtures verify consent and session creation as well as these states.

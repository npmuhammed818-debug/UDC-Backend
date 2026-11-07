# First-deal pilot: synthetic acceptance candidate

This consolidates source-main354 with the continuous signed restart candidate458. It is not a deployment or live acceptance. No real send, hosted SQL/migration, payment, commission policy or launch activation occurred.

## Nine continuous synthetic journeys

| Journey | Evidence | Limit |
| --- | --- | --- |
| First deal | Fictional consented buyer/seller registration, human-reviewed evidence, requirement/offer, admin match, terms agreement and separate deal | Local SQL, private storage and delivery sinks; not provider or human quality acceptance |
| Trial order | Signed reduced-quantity request, pending requirement, review, fresh quote, signed acceptance, new deal | Original deal unchanged; no obligation outside synthetic fixtures |
| Repeat order | Signed request, admin preparation/review/match, fresh terms, signed acceptance, new deal | No stale quote, private files or chat copied |
| Backup seller | Different synthetic verified seller, fresh listing/terms and explicit acceptance, separate deal | No automatic supplier commitment |
| Seller switch | Different seller, signed request and acceptance, separate deal, opposite-deal access denied | Original deal/history retained |
| Rejection and rematch | Signed reject/retry, one alternate proposal, new acceptance then admin creation | Exhaustion keeps demand pending, no phantom deal |
| Private PDF and review | Actual upload route, pending private file, human approval/rejection, role/grant enforcement | Storage is an explicit synthetic port |
| Human help | Signed request, operator self-assignment, owner-only triage/closeout, requester status, seller isolation | Recorded action/outcome only, no claim of customer contact or physical resolution |
| Document extraction and correction | Uploaded PDF, explicit single-document extraction, persisted deliberately incorrect model quantity, mismatch, admin checks original, exact-snapshot correction, both-party comparisons | Extractor/model responses are explicit fixtures. Original extraction and deal terms remain unchanged; human transcription does not prove authenticity, approval or legal validity |

The document correction also reaches the shared conversation memory as a separately labelled human review. It does not replace the original model fields. Revision changes invalidate the earlier review. Only approved shared documents enter cross-party conversation memory; review notes and operator identities do not.

## New admin controls

- Support: "Assign to me" accepts ownership under the current admin identity. Human-help closure requires that owner. Customer-visible status never discloses the private operator ID.
- Documents: confirm and extract one managed private PDF; load current fields; compare the original; record exact decimal/string corrections and an explicit human check. A separate document approval is still required. Failed extraction is not a completed review.
- Mobile and desktop checks use the actual React components with explicit local API fixtures. They validate layout and controls, not hosted connectivity. Separate native SQL tests exercise the actual routes and authorization.

## Local checks

- 779 API tests, API types/build and frontend build/types.
- All21 native PostgreSQL integration suites, including the continuous lifecycle and document review.
- Python3.12:63 worker tests and5 extractor tests. Earlier Python3.10 dependency/compatibility attempts were not passes; they were replaced by the project's supported Python version without editing source or tests.
- Desktop1280px and mobile390px controls visually inspected. Text wraps; extraction inputs have42px minimum height.

Exact-SHA CI and full synthetic acceptance must pass on this candidate before a source-only main merge. A merge still needs the existing production isolation and post-main checks.

## Remaining live pilot gates

Staging deployment permission/setup, target database/TLS/least privilege/storage/restore evidence, actual OTP/Meta window/template/receipt behavior, two-phone language/document privacy UAT, staffed human operations and approved legal/privacy artifacts remain open. A source test cannot certify any of these. All37 requested features are not being declared complete. No credits are needed for the synthetic checks above.

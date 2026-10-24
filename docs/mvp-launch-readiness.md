# UDC launch readiness — full agreed scope

Reference: UDC WhatsApp AI Trade Platform Development Proposal (July 16, 2026),
plus subsequent pooling, privacy, agent tracker and Akif requirements.

## Current MVP checklist — 23 October 2026

This is an implementation inventory, not production acceptance. **PASSED** below
means only the stated isolated check passed. Existing code, green tests and older
live health checks do not prove a complete customer workflow. Historical evidence
later in this file belongs to its stated date/revision.

| Feature | Implementation / genuine gap | Current evidence and remaining acceptance |
| --- | --- | --- |
| Consent and buyer/seller/agent registration | Implemented; manual company verification remains required | PASSED signed webhook + real local PostgreSQL for all roles during simulated AI outages, pending company state, email-conflict correction and duplicate buyer submit. Real WhatsApp delivery and company-review workflow NOT YET TESTED on combined branch. |
| Email OTP / email ownership verification | **MISSING**: no send/verify challenge API, expiring single-use challenge storage, mail delivery adapter, verified-email record or ownership gate. Generic unused OTP UI is not this feature. | NOT IMPLEMENTED; email syntax/domain checks and manual company review do not prove mailbox ownership. Needs rate limits, resend/expiry/replay tests and fictional mailbox acceptance. |
| Email password recovery | **MISSING** email reset request/consume flow and transactional mail delivery | NOT IMPLEMENTED; WhatsApp sign-in challenges are a separate capability. |
| WhatsApp menus and trade intake | Implemented guided forms, drafts, requirements and multiple offers | PASSED local signed conversations, scalar kg/AED fields, two seller offers, retained rejected draft and all four cross-role intake rejections. Live Meta menus/delivery NOT YET TESTED. |
| Akif intelligence, memory, languages and fallbacks | Implemented provider chain, memory and offline guided intake; shared fallback deadline in #121 | PASSED isolated deadline/provider-error/memory checks; real provider availability, naturalness, translation accuracy and latency NOT YET TESTED. |
| Matching, negotiations and private rooms | Implemented matching, approval, private relay, permissions and history | PASSED isolated regression groups; multi-participant persisted workflow and live selective delivery NOT YET TESTED here. |
| Uploads, extraction and verification | Implemented private uploads, signed links, assistive extraction and human review | PASSED isolated authorization/extractor checks; real storage, scans, voice/images, extraction accuracy and human review NOT YET TESTED here. |
| LOI, ICPO, FCO, SPA, NCNDA | Draft generators exist; editable discussion drafts are not executed legal documents | PASSED isolated drafting checks; representative outputs and party/counsel review NOT YET TESTED here. |
| Referrals and commissions | Codes, agent chain, allocations and payout records implemented | PASSED isolated checks; persisted multi-agent reconciliation NOT YET TESTED here. External transfers intentionally remain human-operated. |
| DLC, SGS and payment milestones | Recommended DLC policy with explicit agreement for supported alternate terms; evidence-gated milestone records | PASSED isolated policy checks; banking/inspection evidence acceptance NOT YET TESTED. Issuing instruments/transferring funds is intentionally outside software authority. |
| Shipping, inspections, delivery and feedback | Records, milestones, cases and moderated feedback implemented | PASSED isolated post-deal checks; persisted complete timeline NOT YET TESTED here. Automated carrier integration is not implied by these records. |
| Meetings, notifications and follow-ups | Requests, scheduling records, URLs and messaging paths implemented | PASSED isolated checks; actual delivery/scheduling acceptance NOT YET TESTED. Provider booking remains manual. |
| Admin dashboard, controls and analytics | Admin UI/API, audit and access checks implemented | PASSED isolated checks; complete signed-in workflow and analytics reconciliation NOT YET TESTED on this combined branch. |
| Buyer pooling, privacy and data protection | Allocations, locking, role checks, consent/opt-out and deletion-review paths implemented | PASSED isolated concurrency/privacy checks; bank-reviewed pooling and actual storage/RLS/deletion acceptance NOT YET TESTED. Strict database TLS fix #123 is separate and excluded from this integration. |
| Research, learning and external integrations | Clients/prompts exist | External keys, provider health, accuracy and actual connected workflows remain unverified; presence of a client is not completed integration. |

Combined integration evidence and exact revisions: [integration #119–122](integration-119-122.md).
Separate TLS compatibility investigation: [Supabase TLS](supabase-tls-investigation.md).
No production settings, deployments, customer records or approval states were changed.

## Conversation worker setup

Deploy the worker and API code first. Set `AKIF_WORKER_CONVERSATION_ENABLED=true`
on the API server. It uses the existing `AKIF_WORKER_URL` and `AKIF_WORKER_TOKEN`.
The worker requires the same token and a configured model/key. The self-hosted
brain remains first if explicitly configured; the enabled worker is then tried
before the existing NVIDIA/OpenAI/Hermes fallbacks. Existing deal-system rules,
memory and output validation remain in control of relay decisions.

Set `AKIF_STARTUP_MODEL_PROBE=true` on the worker for a one-call startup check.
Set `AKIF_STARTUP_GEMINI_PROBE=true` to also check the separately configured
`AKIF_GEMINI_MODEL` without changing the chat provider. Gemini requires its key
and `AKIF_GEMINI_DATA_PROCESSING_ACCEPTED=true`; free-tier data handling must be
suitable before sending private material. Set `AKIF_WORKER_MEDIA_ENABLED=true`
on the API to enable voice/image processing through the worker.

The startup test sends only the fixed prompt `Reply only with AKIF_READY.` and logs a status,
model and error class, never credentials, generated text or exception messages.
This tests the selected provider only. It does not test WhatsApp or banking.

## External launch gates

1. Meta accepts/registers the new business number and supplies usable phone ID,
   access token, app secret, verify token and account subscription.
2. Worker/backend secrets and DB/storage are configured; deployments run current code.
3. An authorized admin signs in and verifies test buyer/seller accounts.
4. Complete buyer → UDC → seller → UDC → buyer, document, status and opt-out tests.
5. Record and resolve failures before calling the launch accepted.

ImpexQ and Trade.gov need their own keys. GDELT currently times out from the
inspection environment; its failure is isolated. No promise is made that an
external service is permanently free or that provider approval will finish by a
specific date. Keep all paid plans unchanged unless the owner authorizes spending.

## Historical validation of the launch preparation change

Full release checks passed: production build and 99 backend tests.
21 Python worker/extractor tests passed. Tests cover chat
request bounds, safe provider failures, Gemini processing gate, voice/image
transcription mocks and tutoring. Live end-to-end acceptance is still pending.

## Release follow-up

Image uploads can route directly to the authenticated worker vision path, without
requiring a separate extractor deployment. Buyer allocations lock their pool row
and validate verified buyer status, capacity and audit writes in one transaction.
The worker runtime is pinned through Render `PYTHON_VERSION=3.12.11` after
Python 3.14/LiteLLM import failures were observed in live startup logs.
API startup logs report worker connectivity and configuration without credentials.

## Live verification — 17 October 2026

- Backend release `aa63b73` deployed successfully; 87 backend tests, typechecks and
  frontend/backend builds passed with worker conversation/media flags enabled.
- Public backend and database health, document extractor and AKIF worker health
  returned 200. Admin intelligence and legacy intake returned 401 anonymously.
- Additional admin users/deals/commissions and buyer-pool endpoints returned 401
  anonymously; the frontend entry returned 200 and referenced production assets.
- Backend authenticated worker connectivity passed at 09:08 UTC: reachable, model
  configured, conversation enabled and no missing configuration reported.
- Meta phone-number access and WABA webhook subscription checks passed. These
  checks do not prove real delivery or approval of the owner's new number.
- Groq `groq/openai/gpt-oss-20b` and Gemini `gemini/gemini-3.1-flash-lite`
  each passed live fixed-public-prompt probes at 09:06 UTC and again on the
  fixed cold-start release `0c796de` at 09:20 UTC. The final worker deployment
  is live, with SDK initialization completed before HTTP serving.
- Pinning Python alone did not resolve the SDK import failure. Use the packaged
  model map and initialize LiteLLM before serving HTTP requests (#80), avoiding
  a cold-start deadlock with SDK-installed request logging filters. SDK logging
  is restricted to ERROR; safe fixed-prompt diagnostics remain available.

Actual new-number buyer/seller messages, private media, signed-in deal progression,
referrals, commissions and opt-out still need persisted acceptance checks by
authorized test participants. No full production acceptance or zero-defect claim
is made from health checks and provider probes alone.

## New-number handover and acceptance sequence

Keep provider and Meta secrets in Render environment settings. Confirm the new
number's `WHATSAPP_PHONE_NUMBER_ID` and usable `WHATSAPP_ACCESS_TOKEN`, plus
`WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET` and
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` on the API service. The Meta callback is
`https://udc-backend.onrender.com/api/webhooks/whatsapp`. Subscribe the account
and confirm the callback verification after Meta approves/registers the number.

Use authorized buyer, seller, agent and admin test participants:

1. Complete consent, onboarding and manual company verification. Confirm an
   unverified participant cannot upload into or access a private deal.
2. Submit a buyer requirement and seller offer in separate messages; confirm
   product/specification, quantity, price, destination and Incoterms persist.
3. Approve the match and open the deal room. Exchange messages through UDC;
   verify party phone numbers and private admin notes are not disclosed.
4. Send a PDF, JPEG/PNG image and voice note. Verify private storage, extraction,
   sender/deal association and manual review. Voice terms require text confirmation.
5. Generate LOI/ICPO/FCO/SPA/NCNDA drafts. Check recorded terms and visible
   placeholders; no generated text should imply signature or legal approval.
6. Request a meeting and record its authorized scheduling/meeting URL.
7. Record inspection/shipment/customs/delivery milestones and supporting documents.
   Confirm the recommended DLC/SGS workflow, any explicitly agreed supported alternate terms, and admin-controlled banking evidence.
8. Check referral attribution, agent chain, commission calculations and recorded
   payout states. Check pool capacity rejection and issuing-bank review state.
9. Complete a test deal, submit feedback and inspect admin/audit history.
10. Send STOP and confirm optional notifications are disabled. Consent withdrawal
    and deletion follow the separately documented support/review workflow; STOP
    does not cancel existing deal obligations or erase records.

Record expected/actual outcomes and deal/message/document IDs. Do not call the
launch accepted until failures are resolved. These tests can run now using the
connected Meta test number and authorized test recipients, sessions and participants.
Repeat delivery and onboarding checks after switching to the business number.
Infrastructure probes cannot replace these checks.

## Preparation without the new number — 17 October 2026

- The general document list now uses the same current deal-membership predicate
  as the deal room, as well as approval and explicit sharing grants. Stale grants
  cannot issue new signed links after agent removal or for another deal. Existing
  signed links retain their original five-minute expiry.
- Isolated fixtures exercise actual Express routes and auth middleware: anonymous
  and suspended requests, outsider reads/uploads, mediated-message privacy,
  pending-document visibility, stale grants and agent removal. Running the suite
  against the old document route fails the two stale-access regression checks.
  These checks do not replace live authenticated DB and WhatsApp acceptance.
- A live GDELT probe returned HTTP 429 with a five-second request-spacing notice.
  Cache misses now have a per-process cooldown with bounded Retry-After handling.
  Cached evidence remains usable; core research reports unavailable news rather
  than waiting in a retry queue or fabricating results. Live news availability
  still depends on GDELT and its shared-IP limits.
- Public feed responses are streamed with a two-million-byte limit. Only validated
  JSON evidence is cached; temporary error objects cannot poison FX/news/indicator
  or Eurostat results for the cache lifetime. CSL uses the same response bound.
  The public-evidence cache has an 8 MB serialized-data budget as well as its
  200-entry limit, so large valid responses cannot accumulate without bound.
- Full release verification passed: 99 backend tests, workspace typechecks and
  frontend/backend production builds. Worker code is unchanged (21 Python tests
  previously passed). No new WhatsApp number or production test accounts were used.

Release #82 (`e82c33e`) deployed successfully at 09:37 UTC on 17 October. All six
production smoke checks passed afterward. A read-only EXPLAIN of the membership-
checked document query against the live database succeeded and used existing
document-status, document/user grant, deal-primary-key and participant-user
indexes. This plan check used a dummy ID, did not read trade records and made no
data/schema changes. Authenticated real-user acceptance remains pending.

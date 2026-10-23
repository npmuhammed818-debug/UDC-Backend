# UDC launch readiness — full agreed scope

Reference: UDC WhatsApp AI Trade Platform Development Proposal (July 16, 2026),
plus subsequent pooling, privacy, agent tracker and Akif requirements.

The following is a code audit, not a claim of production acceptance or zero defects.

| Area | Existing implementation | Acceptance still needed |
| --- | --- | --- |
| Email ownership and password recovery | Separate draft implementation: expiring single-use codes, persistent limits, explicit password eligibility and atomic recovery | Mocked automated checks; real delivery intentionally disabled and not accepted. See [email authentication](email-authentication.md). |
| Buyer/seller/agent onboarding | Auth, company profiles, consent gate, manual verification and audit history | Fresh-number onboarding and real persisted accounts |
| Requirements and offers | Natural-language intake, draft memory, product/spec/quantity/price/port fields, private submission review | Real buyer and seller messages; typo/mixed-language cases |
| Matching | Recommendations, manual approval, match/deal creation | Seeded test participants and persistence test |
| Deal room | Deal IDs, private text relay, selective delivery, history and admin views | Live WhatsApp routing and privacy test |
| PDFs/documents | Private upload, signed downloads, document review/extraction and comparison | Storage, scanned-document and live relay test |
| LOI/ICPO/FCO/SPA | Draft generators and editable downloads from recorded terms | Party review and sample outputs |
| NCNDA generation | Editable discussion draft from the deal room, with explicit legal placeholders | Sample output and party/counsel review |
| Voice and direct images | Voice transcription with text confirmation; private image attachment and vision extraction | Real media tests and provider configuration |
| AI/translation | Existing prompts support languages; worker model bridge added in this change | Real configured-model and language accuracy tests |
| Referrals/agents | Referral codes, introductions, ordered deal agent chain, capped allocations, status tracking | Persisted multi-agent deal and payout-state checks |
| Meetings | Requests, admin scheduling, meeting records and provider URLs | Real scheduling/notification test; provider booking is manual |
| Post-deal | SPA milestone, shipment/inspection/customs records, delivery and cases | Full persisted timeline and role access test |
| DLC/SGS | Fixed DLC workflow and evidence-gated completion | Bank/inspection evidence review; software does not issue bank instruments |
| Commissions | Rules, calculations, allocations, recorded payout states | Reconciliation test; external bank transfers remain human-operated |
| Feedback | Completion-gated ratings with moderation | Completed test deal and moderation test |
| Admin | Users, deals, docs, finance, communications, audit, analytics | Signed-in UI walkthrough; live schema and private storage checked |
| Buyer pooling | Pool creation, allocations and bank-review state | Bank-approved structure; allocation concurrency test passes |
| Akif research | Comtrade/GLEIF, FX, news, World Bank, Eurostat and CSL clients | Upstream keys where required, admin research acceptance |
| Learn | Curated lessons plus model-backed beginner questions | Live tutor accuracy and language tests |
| Privacy/operations | Consent, opt-out, role checks, deletion-review requests, signed documents | New-number consent and withdrawal test |

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

## Validation of the launch preparation change

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
   Confirm the fixed DLC/SGS workflow and admin-controlled banking evidence.
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

# UDC launch readiness — full agreed scope

Reference: UDC WhatsApp AI Trade Platform Development Proposal (July 16, 2026),
plus subsequent pooling, privacy, agent tracker and Akif requirements.

The following is a code audit, not a claim of production acceptance or zero defects.

| Area | Existing implementation | Acceptance still needed |
| --- | --- | --- |
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

Full release checks passed: production build and 87 backend tests.
19 Python worker/extractor tests passed. Tests cover chat
request bounds, safe provider failures, Gemini processing gate, voice/image
transcription mocks and tutoring. Live end-to-end acceptance is still pending.

## Release follow-up

Image uploads can route directly to the authenticated worker vision path, without
requiring a separate extractor deployment. Buyer allocations lock their pool row
and validate verified buyer status, capacity and audit writes in one transaction.
The worker runtime is pinned through Render `PYTHON_VERSION=3.12.11` after
Python 3.14/LiteLLM import failures were observed in live startup logs.
API startup logs report worker connectivity and configuration without credentials.

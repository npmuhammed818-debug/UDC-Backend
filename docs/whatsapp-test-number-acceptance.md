# Connected test-number acceptance — 21 October 2026

Source of scope: SmartMatrix UDC WhatsApp AI Trade Platform Development Proposal,
16 July 2026. Use the existing connected Meta test number now. A new business
number is not a prerequisite for testing the application logic with authorized
test recipients. Record real delivery separately from simulated provider success.

## Fixes in this release

- First priced buyer/seller inquiries and pending-account follow-ups reach intake
  instead of being intercepted by existing-deal keyword checks. Suspended and
  rejected accounts cannot resume trade processing through this route.
- WhatsApp file retrieval checks ownership or approved explicit sharing. Forwarding
  additionally requires approval and an explicit recipient grant. A private or
  unreviewed counterparty file cannot be fetched merely by naming its type.
- Uploaded WhatsApp files receive owner access records for the document center.
- File/image/voice replies resolve the quoted message's deal and current membership.
  An unknown, other-user or revoked quoted context cannot fall back to another deal.
- Existing LOI, ICPO, FCO, SPA and NCNDA generators are reachable through WhatsApp.
  Request, for example, `prepare LOI draft`, then reply to the preview with
  `CONFIRM DRAFT LOI`. Confirmation binds to the displayed commercial terms.
  LOI/ICPO are buyer actions; FCO is a seller action. Output is a private editable
  text draft, stored pending review with owner access and an audit event. No draft
  is signed, issued or automatically sent to the counterparty. Legal party details
  remain explicit placeholders. Existing web draft controls remain available.

## SoW traceability and phone acceptance

All rows below still require signed-in/live participant acceptance. Code presence
and isolated route checks are not a claim that every production flow has passed.

| SoW area | Existing path to exercise | Required real test |
| --- | --- | --- |
| Registration and verification | Consent, buyer/seller intake; web profiles, agent signup and admin verification | Fresh buyer, seller and agent; approve/reject; check restrictions |
| Buyer inquiry and seller offers | WhatsApp extraction and persistent draft memory; admin review/matching | Submit grade, quantity, price, port, Incoterm and timing across messages; inspect saved fields, not just reply wording |
| Match and offers | Existing recommendation and approval workflow | Use real fixture records; approve one match and verify correct recipients |
| Deal room and private relay | Verified membership, quoted/active deal context, selective AI relay and history | Two authorized phones; outsider and second-deal checks; verify hidden contact details |
| Images, PDFs and voice | Private uploads, document review, image/voice worker paths | Send each media type; verify correct deal, extraction, ownership and review; confirm voice terms in text |
| LOI/FCO/SPA/NCNDA and ICPO | Web draft endpoints plus WhatsApp request/preview/confirmation | Generate all types with correct roles; open editable copies; change price before confirmation; verify no unintended forwarding |
| AI assistance, translation, summaries, commodity explanations | Existing intake/deal model and Learn tools | Natural and mixed-language questions; verify answers against records and source text |
| Referrals and commissions | Referral codes/links, agent chain, calculations and admin payout records | Agent signup/link attribution, closed-deal allocation and payout-state reconciliation |
| Meetings | WhatsApp `meeting_request` conversation events in admin meeting-request list; manual scheduled meeting records | Request by phone, verify admin list, schedule and confirm time/URL notification |
| Post-deal | Admin SPA/shipment/inspection/customs/payment milestones and private deal tracking | Persist a complete test timeline; verify missing evidence blocks completion |
| Feedback and distribution | Completed-deal feedback moderation and recorded commissions | Attempt before completion, complete with evidence, submit/moderate rating |
| Admin dashboard | User/deal/document/finance/chats/notifications/announcements/analytics/audit controls | Authorized browser walkthrough and role checks; review totals against test records |
| Additional agreed pooling/privacy | Existing buyer pools, bank-review state, consent/STOP and data-request process | Capacity rejection, separate participants, STOP disables optional notifications |

Human-operated steps remain human-operated: identity/company review, match
approval, meeting booking, bank/SGS evidence, payment and commission transfers.
The software records these actions; it does not issue a DLC or transfer money.

## Validation and observations

- Baseline: 99 backend tests passed before changes.
- Added actual signed Express webhook tests with isolated DB/provider/storage
  fixtures for intake, signatures/consent, document access, quoted context,
  upload deduplication, drafts and meeting-event persistence.
- Against the original webhook, the new route suite fails on the confirmed
  regressions. Against this release it passes.
- Workspace typechecks and frontend/backend production builds pass.
- All six production smoke checks passed after the free worker finished waking.
  The first smoke attempt timed out waiting for the sleeping worker. This remains
  an operational limitation of the current free hosting; no paid plan was changed.
- Latest observed backend startup passed Meta phone-number access and WABA
  subscription checks. Those are not a message receipt/delivery test.
- Latest worker startup passed the Groq probe. Its Gemini probe returned
  `ServiceUnavailableError`; Gemini availability is not accepted as passing.

## First live action

The owner sends `Hi` to the connected test number. Confirm receipt in the webhook
and a privacy notice on the phone, then send `AGREE` if appropriate. Continue with
one buyer requirement. Use a second authorized recipient for the seller and an
authorized admin session for review. Never create fabricated verification records
or bypass the signature, consent, membership or document-sharing checks to test.

For every case retain expected/actual results and associated message/deal/document
IDs in the authorized project records, without copying private content or secrets
into the public repository. Mark each row passed only after the real test.

## Live chat follow-up

The owner's first greeting reached the signed webhook but exposed unapplied
agent-chain columns on `deal_participants`. The existing
`lib/db/migrations/0015_deal_agent_referral_chain.sql` was applied and verified.
A catalog comparison of every exported application table/column then found no
missing tables or columns. This check does not validate every runtime workflow.

The next greeting passed persistence and outbound acknowledgement, but the worker
returned HTTP 502 and the configured NVIDIA/OpenAI fallbacks returned 403/401.
The owner received the explicit processing-failure reply. This is not a successful
AI-conversation acceptance result.

That deal had 152 history events; the old prompt retained an unbounded significant
history. Limit the model conversation to the latest 24 eligible events, retaining
the exact quoted delivered offer when it is older. Confirmed deal facts stay in
structured memory; omitted history is not evidence of agreement or permission.
Context-loading failures now produce a safe unprocessed result rather than an
uncaught webhook error. Worker diagnostics log only exception class, numeric
provider HTTP status and input lengths, never provider error bodies or user text.
History growth is a confirmed issue; provider diagnostics must establish whether
it caused the live model rejection before attributing that rejection to a quota.

## Switching to the business number

Keep the same code and existing callback. Configure the business phone-number ID,
usable access token and corresponding WABA subscription/verification in the secret
settings. Confirm Meta setup and repeat inbound/outbound, consent, buyer/seller
relay, media and STOP checks. Meta registration and token permissions are external
requirements; a configuration change alone is not proof of successful delivery.

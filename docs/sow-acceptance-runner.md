# Repeatable SoW acceptance

Run `pnpm run acceptance` from the repository root. It groups isolated regression suites by the eight SoW sections and writes JSON and Markdown under `.acceptance-results/`. CI uploads the reports. Uncovered workflows stay explicitly uncovered. Green regression results are not production acceptance. Test subprocesses receive no production credentials.

## Synthetic live model probe

Set `UDC_ACCEPTANCE_RUN_ID` to a unique 8–80 character identifier. At startup a transactional advisory lock and audit-log claim allow only one run for that ID across restarts. A separate child receives only the existing worker URL/token and PATH. It receives no production database, WhatsApp, storage or paid-provider credentials and has no persistence or notification clients.

It exercises the actual intake prompt/parser against the existing worker with synthetic copper and sugar inquiries: five cases maximum (four model calls after the deterministic follow-up fix), 65 seconds between model cases, no retries or paid fallbacks. Provider/validation failure stops the run as blocked. The parent enforces a seven-minute deadline. Only fixed case names, failed field names and statuses enter logs/audit records, never model text or credentials. Remove the run ID to disable. Reusing an ID never reruns it; a new ID authorizes a new bounded test run.

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

## Invitation links

Verified agents can copy a personal invitation link and reference code. Links use a purpose-separated HMAC signature with the existing app secret and a configured HTTPS public app origin. A registrant must opt in to attach the introduction; registration rechecks the inviter's current verified agent status. Tampering, suspension and agent-to-agent signup cannot create an attribution. Attribution, registration consent and the new pending account are recorded in one transaction. No commission is inferred from a referral. The API registration contract and generated clients include the optional token.

Additional actual route fixtures cover approved/verified matching, mismatched products/units, suspended parties, private participant creation and duplicate match/deal rejection. Shared workflow suites appear in multiple SoW sections, so section counts must not be summed.

## Deterministic follow-ups and synthetic media

A later live run passed copper, optional grade/delivery, partial intake and seller terms but intermittently omitted the price in a buyer follow-up. Complete, strictly formatted USD price/port follow-ups now use exact parsing when a product/quantity draft already exists. Questions, negation, hypotheticals, malformed numbers and submitted records do not take this path. This saves a model call and prevents reconfirming facts already supplied. Intake reports now count model calls separately from test cases.

Set `UDC_ACCEPTANCE_MODE=media` with a new run ID to opt into three bounded media-service requests. This separate child additionally receives only the existing document-extractor URL/token. It sends an image containing fixed synthetic terms, locally generated Flite speech and a one-page synthetic PDF. It checks extracted terms and review/confirmation flags without saving model text or creating trades. The two worker requests are 65 seconds apart. The PDF request uses the existing extractor. No retries or paid fallbacks are introduced.

Worker image transcription supports an explicit `AKIF_VISION_MODEL`, including `groq/qwen/qwen3.8-27b` with the existing Groq key. The prior explicitly enabled Gemini path stays available when no override is set. Provider errors expose only exception class, numeric HTTP status, byte count and MIME type. Human document review and voice text confirmation remain mandatory. Configuration and live service acceptance still must pass before claiming media ready.

Model selection was checked against Groq's official [vision documentation](https://console.groq.com/docs/vision), [Qwen model card](https://console.groq.com/docs/model/qwen/qwen3.8-27b) and [free-plan limits](https://console.groq.com/docs/rate-limits) on 20 October 2026. The media path uses instruct mode, no retry, and the existing service plans.

## Participant model privacy and build isolation

The customer-facing model now receives confirmed public deal fields, its participant's own history and only the actually delivered text from the counterparty. Another participant's undelivered messages and coordinator replies are excluded. Private request/listing prices, commissions and banking references are excluded. Document status can be visible to its owner, but extracted document facts enter the coordinator prompt only after review and access for both trading parties. Full internal/admin context remains available to authorized internal workflows.

A deterministic output guard blocks contact details and numeric private limits from current or historical private clauses. A new exact offered-price instruction can explicitly release that same value as a proposal. These guards supplement input minimization; they do not certify arbitrary model answers or document authenticity. Tests inspect actual broker prompts as well as the projection and relay functions. The grant query was checked with a read-only EXPLAIN against existing indexes.

The first media-mode API deploy exposed a test-harness issue: build tests inherited runtime probe configuration. The API test launcher now starts tests with a small environment allowlist and no runtime service credentials or probe flags. Release verification is also run with media probe flags set on the parent to reproduce that deployment condition safely.

Local component server-render checks passed for execution controls, feedback and invitation cards. Full browser visual acceptance remains pending: the browser download was blocked in the coding environment. This limitation is separate from passing route tests and production builds.


## Confirmed live service results — 20 October 2026

API release PR96 / `5fd6e132245cd6265b39c524433b8888d3f7d42f` and worker PR95 / `1f57d50c05f21e1b1f3216a8a47d968b1882e0a7` passed the bounded service probes:

- `intake_20261020_e`: all five cases passed, four model calls, exit 0. Copper CIF Jebel Ali, sugar grade/delivery, missing fields without invention, follow-up memory, and seller terms.
- `media_20261020_a`: synthetic image transcription, voice transcription and PDF extraction all passed, three service requests, exit 0.

Earlier failures above are retained as the reason for their fixes; these successful reruns supersede their pending service retest status. These probes do not send WhatsApp messages, create traders or trades, or prove two-party Meta delivery. They use the existing free service plans and configured providers; no paid plan, new paid service or paid fallback was added. Provider quotas can still limit availability.

## WhatsApp-owned web access

`/whatsapp-signin` creates a five-minute request with a separate private browser token. Send `LOGIN <code>` from the actual WhatsApp number, read the warning, then send `CONFIRM LOGIN <code>`. The signed Meta webhook enforces existing consent and blocked-account gates before this handler. Only the browser holding the separate secret can consume the approval and receive the existing HttpOnly session cookie. Tokens and codes are hashed at rest, kept out of URLs, and never returned by polling. Expired rows are purged after a day when the next request is created.

Phone-only accounts retain their existing role/status. New accounts stay pending. Email/admin accounts cannot bypass their existing password login through anonymous phone sign-in. An eligible signed-in web account may link an unclaimed number through `/link-whatsapp`; the same initiating account is required when polling. Conflicting profiles require human review and are never merged automatically. Registration/profile APIs reject arbitrary phone fields. Existing legacy phone bindings are preserved and need individual review if disputed.

After sign-in, the existing Profile & company page supports company details and private verification-document submission for admin review. WhatsApp-only users can reach this workflow without a paid SMS provider. This verifies control of a number, never company legitimacy. No auto-approval, bank action or payment execution is introduced.

The additive challenge-table migration enables RLS and revokes public/anonymous/authenticated access, matching the server-only database architecture. Tests exercise the actual challenge service, session writer and HTTP routes with isolated relational fixtures, including wrong phones, two-step confirmation, expiry, replay, private-cookie issuance, role preservation, profile conflicts, suspension, initiating-session checks and rate limits. Signed webhook tests separately prove consent/signature/block gates.

## Remaining acceptance before launch

All eight SoW sections have automated coverage; this is not a claim that every feature has completed real-user acceptance. The remaining gates are actual test-number delivery between two authorized buyer/seller identities, all-role company verification and document review, multilingual text/media, approved matching and negotiation, invitations and agreed commission recording, verified-party meetings, shipment/customs/payment evidence/completion/feedback, admin reports/announcements, and browser visual checks. Use synthetic fixtures or expressly authorized test identities. Human verification, legal, banking, inspection and payout decisions remain human controlled. Connecting the final business number also requires its Meta configuration and delivery verification.


## Agent approval completion

Pending agents now appear alongside buyers/sellers in the existing admin verification queue, and the same admin-only status route accepts all three trading roles. Admin identities remain excluded; this never grants an admin role. Status changes, their audit trail and in-app notification share a transaction with a per-user lock. Repeating the same status does not repeat notifications. Regression fixtures cover pending-list filtering, authorization, agent review/approval/rejection, invalid/missing accounts and rollback if the audit write fails. New and existing agent roles/statuses never change automatically.

The WhatsApp sign-in page now uses an explicit responsive, bounded layout and native readable role control, rather than relying on undefined page layout classes. Full browser visual acceptance remains pending.

A cloud browser became available for public-screen review after the earlier local browser-download failure. The live desktop login screen confirmed that its layout classes were missing, so login/registration now have responsive form and visual-panel styles using the existing theme tokens. Authenticated admin screens and a full mobile-browser pass still require separate acceptance.


## Native WhatsApp UI

After the existing consent gate, send `Hi`, `Menu`, `Help`, `Start`, or `Features`. New participants receive Buy products / Sell products / Agent services buttons. Registered users receive a native list for their stored role. Button/list IDs are allowlisted; display titles never authorize actions. Signed button, list and Flow-completion webhooks pass the same consent and blocked-account gates as text. Plain chat and voice continue through the existing conversation handlers.

Static Meta Flows provide buyer/seller company registration, a separate personal-or-business-email agent registration, buyer requirements and seller offers entirely in WhatsApp. The trade forms explicitly use MT and USD; other units/currencies remain available through natural chat. Buyer/seller profile forms require company name/country and reject common personal-email domains; agents may use personal or business email. Domain classification is not verification: UDC still reviews the company and its evidence. Existing roles cannot be changed or unrelated email profiles merged. Material edits reset verified identity/company review.

Flow tokens are purpose-separated HMAC proofs bound to the sender, with random nonces and a 30-minute expiry. A transaction lock and audit claim protect replay. Trade forms reuse the actual requirement/offer writers inside the audit transaction. All new profiles/submissions remain pending human review. Only the sender's authorized deals, agent assignments, referrals and commissions are queried. Verified-user deal selection rechecks current membership before setting existing conversation context.

Upload documents sends a company-specific request: reply to that exact message with a PDF under 5 MB. Quoted request ownership is checked before storage; files use existing private company storage and pending-review records. Retries do not create another document. Deal document replies retain the existing quoted-deal path. No customer web login or web form is needed for these chat paths.

An operator may set `UDC_WHATSAPP_FLOWS_SETUP_RUN_ID` to a unique 8–80 character identifier. Startup claims it once in the existing audit table, reuses named Meta flows where available, uploads static JSON, checks validation, publishes and rereads the status. Only confirmed published IDs enter the runtime registry. Setup never sends trader messages and uses only the existing WABA/token. Failed forms are not advertised as active; the bot gives an honest activation message and preserves natural trade intake. A new run ID is required to retry a failed setup. Meta permissions/account eligibility remain an external dependency. No paid service, model call or schema migration is added.

Tests cover actual menu/form services, issuer/recipient binding, expired/tampered tokens, business-email rules, role preservation, replay, audit rollback, actual writer mappings, private deal selection, agent access and private quoted company PDFs. Meta publication tests isolate network calls and cover existing published flows, validation errors and permission rejection. Live publication/delivery results must be checked separately before calling the UI accepted. Official implementation references: [Meta interactive messages](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/), [Meta Flow survey example](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/articles/creating-surveys), and [Meta Flow publishing reference](https://www.postman.com/meta/whatsapp-business-platform/request/wcidrlg/publish-flow).


## Native form account gate and guided chat fallback

The live setup run `chat_ui_20261021_a` was rejected by Meta with HTTP 400 / code 139000 before any flow entered the published registry. Native Flow forms are therefore not active on this account. Do not imply that replacing a number or retrying guarantees eligibility. Buttons and list menus are independent of the Flow publication path. No alternate Flow-account workaround or repeated publisher attempts were added.

When no published form is available, the same role buttons and menu choices start guided WhatsApp questions. A summary is followed by native Submit for review / Edit details / Cancel buttons (typed equivalents work if buttons fail). Only explicit submission invokes the existing form validator/writers. Names, email, company details and trade terms remain inside WhatsApp. Agents may use normal or business email; buyers/sellers require company email/details.

The additive `whatsapp_chat_sessions` table stores private temporary answers keyed by a purpose-separated HMAC phone fingerprint. It has RLS enabled and no public/anon/authenticated grants. Drafts expire after 30 minutes of inactivity; startup, periodic 15-minute cleanup and new-draft cleanup remove expired drafts. Menu exits the draft; Edit resets it; Cancel discards it. Message IDs prevent retry events advancing a question twice. Final submissions share a stable signed nonce, so retries and concurrent taps cannot create another record. An audit failure retains the confirmation draft for safe retry. The actual guided service tests cover validation, replay, review-before-write, editing, cancellation, expiry, rollback and normal-email agent registration.

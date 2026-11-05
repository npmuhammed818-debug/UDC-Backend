# Brainstorm implementation evidence, 2026-11-04

Source-only main moved to 9f176ea after all seven CI checks. Production remained 8743bd6; no deployment. Follow-on staging candidate aa93241 is not on main. No global percent is meaningful: these ideas differ in scope, and code presence is not end-to-end readiness.

| Idea | Current evidence | Remaining |
|---|---|---|
|1 Status picture;28 progress bar|Staging SVG/JSON, actual SQL/HTTP privacy + pixels|WhatsApp image delivery not wired|
|2 Price watch|No dedicated implementation located|Provider, opt-in, threshold, stale data, delivery|
|3 Trust badge;18 fake-seller shield|Verified parties gate and current review label, no guarantee|Evidence-backed screening presentation and risk review|
|4 Voice summary;31 voice-first|Existing voice replies and transcription, text-only critical terms|Dedicated deal voice summary/customer device tests|
|5 Document checker|Existing extraction plus exact deterministic field comparisons, grant/freshness checks executed|Uploaded real-format fixture end-to-end; model extraction is untrusted|
|6 Repeat order|Explicit request on completed deal saves buyer-owned draft for human review, SQL tested|Reviewed new requirement, fresh seller proposal and agreement|
|7 Currency helper|No live-rate helper located|Dated provider, FX source, rounding, no silent deal-term conversion|
|8 Delay warning|Existing recorded ETA and stale-update advisory, not physical delay proof|Full watch/provider/notification readiness check|
|9 Deal memory|Existing authorized recent conversation + document-filtered memory|Cross-deal delivery-performance evidence, no private reasons|
|10 Sample request|Dropped by user|Do not build|
|11 Weekly market news|No dedicated customer delivery path located|Sources, dated facts, opt-in and delivery|
|12 Group deals/buyer pool|Existing admin creation, capacity locks, invite acceptance/expiry + native integration suite|Same-country pilot enforcement and explicit manual review stage|
|13 Trade-term tips;21 negotiation coach|Existing handbook/guidance, no trade authority|Dedicated context-safe coach evidence|
|14 Seller scorecard|No dedicated scorecard located|Reliable message/response timestamps, seller-private comparison, no invented rating|
|15 Photo quote|Existing image transcription foundation|Price-list/offer extraction and verified matching end-to-end|
|16 Quality proof pack|Grant-filtered approved document metadata index, native test|Photo/cert package UI and explicit sharing flow|
|17 Referral reward|Existing referral/code/invite paths|Discount not built. Commission rule needs separate owner approval|
|19 Freight estimate|Guidance warns examples are rough|Dated carrier/forwarder inputs, routes, fees and no booking|
|20 Festival timing|No dedicated implementation located|Country/product calendar sources and commercial opt-in|
|22 Reminders|Existing task planner and shipment ETA follow-ups|Customer-owned general reminders and accurate delivery state|
|23 Trader diary|UTC-month current-state counts SQL tested. Savings/ranking null|Historical completion ledger and evidenced savings|
|24 Human help|Explicit request queue + existing handoff detection/grievance|Human assignment and actual work. Review closeout/status now records admin attestation, no claim person contacted|
|25 Backup seller;quick switch|Predeal reject/rematch exists; new private buyer-only review request|New linked deal workflow, fresh terms/acceptance, never transfer old seller records|
|26 Exit reason|API structured private reason stored for admin|Explicit WhatsApp 'exit reason delay' now works; guided buttons/skip remain. Never relay private reason|
|27 Language bridge|Existing multilingual comprehension/voice foundations; text currently English by policy|Translation relay with exact critical terms preserved and scope review|
|29 Trial order|No dedicated implementation located|Explicit proposed reduced quantity, seller terms, no inferred commitment|
|30 Agent leaderboard|No leaderboard located; agents have redacted own referral views|Permissioned publication, honest metrics, no prices/private identities|
|32 Paperwork helper|Existing LOI/ICPO/FCO/SPA/NCNDA drafts and review flow|Country/transaction checklist validity, no legal/authenticity claims|
|33 Dispute helper|Private review request + existing case controls|Neutral authorized evidence bundle, party isolation and human decision|
|34 Seller of the month|No dedicated implementation located|Metric definition and permission to publish award/identity|

## Safety/release gaps
Live document OTP adapter is deliberately not configured, so no real code or message was sent. No hosted fixture/migration SQL was run. Review origins/environment and device/provider tests remain. Customer commands in the new slice are staging-only; admin queue is read-only. No commission, banking or payment rules changed. Existing handbook language is not proof of any financial protection or legal promise.

## Nov 4 evening pool pilot increment
Staging exact-country gates now check lead buyer and every active member before allocation and acceptance. Country is pinned in the pool creation audit; changed/missing/foreign labels fail closed, aliases are not guessed. Manual human review requires all accepted quantity to fill the pool and appends an audit event, with bank status unchanged. Staging allocations never invoke the real notification sender. Admin v2 Support has create, allocation and human-review forms plus readback. Native PostgreSQL/actual authenticated HTTP tests executed, including changed-country cases, outsider/admin access, idempotent review and no bank mutation. Desktop/390px actual form pixels inspected with synthetic fixtures. This does not create a shared DLC or execute a pooled purchase, so those promises are not marked complete.

## Restart increment
Admin can prepare one pending buyer requirement from a repeat/switch/backup request. Transaction rechecks buyer identity/status, original deal stage and current buyer-owned source request. Concurrent duplicate actions return one requirement. No seller fields, documents or chat are copied, and no deal or message is created. Executed actual native SQL/HTTP confirms admin-only access, parallel200/201, pending status, buyer-proposed payment wording and unchanged original deal count. New admin button is preparation only; fresh requirement review, verified match, seller proposal and exact buyer acceptance still use the existing guarded workflow. Full automated seller switch is not marked complete.

## Currency helper explicit-conversion increment
Explicit WhatsApp `convert 100 USD to INR` and authenticated staging API work through the actual handler with synthetic provider/message sink. Dated rate, source, rounding and no-bank-quote/fee-spread disclaimer returned; deal terms never mutated. Provider receives currency pair only, no user/amount/deal; six-hour cache and bounded body/time/stale guards. Decimal arithmetic half-up tested, including large values and zero/three-decimal currencies. Invalid/stale/missing data refuses rather than guesses. Actual free public Frankfurter endpoint probed separately (no private data or real sends). Documentation https://frankfurter.dev/ permits free commercial blended rates; single-pair format https://api.frankfurter.dev/v2/rate/eur/usd verified. This is reference conversion, not live trading or a bank quote. The original idea also calls for automatic recipient-currency references in price messages. That integration is still pending; do not count the full feature complete. No production deployment implied.

## Automatic price-currency follow-on candidate
A verified buyer/seller can explicitly set `price currency INR` or `price currency off`. Preference is recorded in an append-only audit event, not guessed from country, phone, language or location. Staging outbound text/button/list/flow body and document/image captions get additional dated references for explicit supported currency-code amounts; original text and units stay intact. Amounts with only a currency symbol are not guessed. Three distinct prices maximum; longer/more complex messages explain reference omission rather than changing the quote. Provider sees public pairs only; missing rates are stated. Actual SQL preferences and actual outbound client payloads executed through the local reply sink, including opt-out and unrelated-recipient isolation. No Meta calls, hosted migrations or live sends.

## Source-backed trade tips and private seller scorecard candidate
Explicit `explain FOB/CIF/CFR/FAS/LC/DLC` asks now get curated plain-language guidance and examples with ICC or Trade.gov source URLs. Risk is not confused with freight cost or arrival, and bank approval/payment/title/dispute terms are not inferred. No arbitrary model-generated legal advice. Sources read on 2026-11-05: https://www.trade.gov/know-your-incoterms and https://www.trade.gov/letter-credit and https://library.iccwbo.org/content/tfb/BOOKS/BK_0049/BK_0049_05_RulesSea.htm?l1=Books&l2=Incoterms%C2%AE+2020 . Contextual automatic coaching remains separate.

Verified seller `my scorecard YYYY-MM` returns only their own seller-deal successfully relayed buyer/seller event metadata summary: first reply per inbound turn on the same deal, median calendar minutes and unanswered turns. UTC period and boundary omissions explained. It does not expose messages, buyer identities, prices, competitor statistics or invented buyer preferences. Native SQL/actual handler tests executed on synthetic messages. This is request-driven, not a proactive monthly send or comparison benchmark; do not mark those absent pieces complete.

Scorecard grounding correction: generic `messages` stores admin messages, not customer relay turns. The scorecard now reads `deal_conversation_events` only when `relayed=true`, matches the actual seller/buyer IDs and roles on that deal, and excludes unrelayed/admin/document events. The timestamp measures recorded customer submission to recorded reply submission among successful relays, not provider delivery latency. No fabricated production data.

## Price watch candidate
Verified buyer explicitly watches a threshold for their own selected approved requirement. Unit/currency are pinned, exact same-currency decimals, no converted comparison. An hourly, default-off staging runner only runs with the local reply sink enabled, so it cannot send real Meta messages. Scans current compatible approved seller listings with currently verified accounts and approved company evidence. Seven-day freshness guard, capacity/MOQ/specification/incoterm/destination/inspection matching, original buyer target still applies. Parallel scans are locked and one alert per watch/listing version is recorded; opt-out latest event wins. No seller identity, private floor or buyer target goes to a counterparty. Native SQL/handler tests executed stale, currency mismatch, destination mismatch, suspended seller, parallel dedup and opt-out. Real customer-window/template delivery remains a release gate, not counted done.

## Private negotiation coach candidate
Verified direct buyer/seller can ask `coach counter 95 USD` on their selected negotiation deal. Returns only a private draft using the user-proposed amount and exact recorded currency, unit, Incoterm and destination. Other terms still need agreement. Never invents a seller margin, market value, room to negotiate or probability of acceptance. Wrong currency, missing term, wrong party or non-negotiation fails closed. Actual native SQL/handler confirms only requester gets the draft and deal values stay unchanged. Price recommendation from evidence remains unbuilt, so this does not finish the original coach idea.

## Guided private exit reason candidate
After a successful explicit confirmed deal closure, staging asks the closing party an optional list question with price/delay/trust/quality/terms/other/skip. Callback includes deal ID and rechecks current verified direct party plus their own closure audit. Counterparty/forged callback is denied. Answer uses existing immutable private request queue, skip is idempotent and never shared. Native SQL/actual prompt/handler test executed. Customer-device list rendering remains unverified; only source-side synthetic execution claimed.

## Synthetic document-code adapter candidate
Document review now accepts the current verified recipient's code delivery through the staging local reply sink only. Live Meta code delivery remains impossible in this adapter. Current user role/status rechecked, failed delivery refused. Existing browser-bound OTP/session/receipt security stays intact. Native SQL adapter test confirms sink-only gate, correct recipient and suspension denial. This does not claim real WhatsApp template activation or customer-device delivery.

## Small-first preparation candidate
Explicit `trial order 2 MT` creates a reduced-quantity pending buyer requirement from the requester's own selected pre-contract deal. Exact positive quantity reduction and unit enforced with decimal arithmetic; fresh quote required, target/seller prices not copied. Parallel duplicate requests return one draft. Late-stage deals, seller/outsider, equal-or-higher quantity or wrong unit refused. Actual native SQL executed idempotence/privacy/late-stage guards; no order/deal or obligation created. Proactive suggestion and fresh seller acceptance workflow remain separate.

Document review evidence extension: executed one integrated native PostgreSQL plus actual Express flow from authenticated link issuance, anonymous sink code request, initiating-browser cookie binding, code verification, session PDF fetch and reviewed-only receipt, then revoked-grant denial. Storage is still a synthetic PDF fixture and provider is a local sink. Earlier OTP budget/concurrency cases run separately in the same isolated schema; no hosted data touched.

## Explicit customer reminders candidate
Verified direct party can set a documents/payment/shipment reminder with a full timezone-offset timestamp, or stop existing reminders for the selected deal. This is explicitly the user's reminder time, not an invented contractual deadline. Current membership/status and active deal rechecked at scan; default-off minute runner is hard gated to synthetic reply sink only. Parallel sends deduplicate per request and stop wins for prior reminders. Already delivered and over-24-hour-late reminders are excluded from the bounded scan. Actual native SQL/handler tests executed. Real customer window/template delivery and automatically sourced contractual due dates remain unbuilt.

## Neutral dispute evidence candidate
Admin-only endpoint and Support panel display a bounded source-attributed timeline of the two current verified direct parties' original/relay texts and approved document metadata. Never includes private exit reasons, file URLs, bank records or unrelated parties/deals. Text is labelled untrusted source material; no model makes fault, credibility, authenticity, refund or payment decisions. Actual native SQL/authenticated HTTP tested buyer denial, admin read, non-dispute rejection and no file URL. Desktop and 390px real built Support-panel pixels inspected using synthetic fixtures: readable wrapped original/relay evidence, clear boundaries and human review controls. No files or messages shared.

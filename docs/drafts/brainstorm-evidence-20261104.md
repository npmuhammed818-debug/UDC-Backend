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

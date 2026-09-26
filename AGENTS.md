# UDC / UpDownCircle — AGENTS.md

## Purpose
This file is the persistent product and development context for AI coding agents working on UDC.
Read this file before making changes. Do not repeatedly ask the owner to explain UDC.

## 1. What UDC Is
UDC (UpDownCircle) is a WhatsApp-first global B2B import/export trade platform.

It connects legitimate buyers, sellers, agents/brokers and UDC administrators, structures trade requirements and offers, supports verification and matching, manages trade documents and deal stages, and tracks commissions.

The long-term goal is to make complex international B2B trade dramatically easier while preserving human control over high-risk decisions.

The initial interface is REAL WHATSAPP. Do not build a WhatsApp clone unless explicitly requested.

Core direction:

WhatsApp
→ AKIF
→ UDC Backend/API
→ Supabase/PostgreSQL
→ Trade workflows, matching, verification, documents, deals and commissions

## 2. AKIF — UDC Intelligence Layer
AKIF is UDC's AI intelligence and operations layer. AKIF is not merely a chatbot.

AKIF should progressively be able to:
- Understand natural buyer, seller and agent conversations.
- Maintain relevant deal context.
- Convert conversations into structured buyer requirements and seller offers.
- Ask for missing trade information.
- Search authorized UDC data.
- Recommend and explain buyer/seller matches.
- Calculate transaction values, commissions, margins and relevant costs when enough data exists.
- Read and extract information from trade documents.
- Compare documents with agreed deal terms.
- Flag inconsistencies, missing information and potential risk indicators.
- Assist with drafting trade documents from approved stored deal data.
- Answer import/export questions.
- Teach beginners about international trade.
- Coordinate workflows and notifications.
- Assist UDC admins with verification/review.
- Escalate sensitive decisions to humans.

AKIF MUST NOT:
- Invent buyers or sellers.
- Invent offers, prices, documents, stock, transactions or verification results.
- Claim a company is genuine solely because documents were uploaded.
- Independently approve high-risk trade, legal, banking or payment decisions.
- Pretend UDC is a bank, inspection company, law firm or government authority.

AKIF assists. UDC records and controls workflows. Humans retain authority for sensitive decisions.

## 3. WhatsApp-First Experience
Users should be able to interact naturally rather than navigate a complicated marketplace.

Example:
Buyer: I need 500 MT Copper Millberry monthly, CIF Jebel Ali, maximum $6,000/MT.
AKIF should understand the request, identify missing fields, ask concise follow-up questions, and store a structured requirement.

Seller onboarding and offer creation should work similarly.

WhatsApp can eventually deliver:
- Verification updates
- Match notifications
- Offers
- Document requests
- Deal-stage updates
- Inspection updates
- Shipment updates
- Payment-stage updates
- Other important transaction notifications

Do not expose unnecessary backend complexity to users.

## 4. Main Roles
- Buyer
- Seller
- Agent/Broker
- UDC Admin

Future roles may include:
- Verification team
- Logistics partner
- Inspection partner
- Financial/banking partner

Use role-based authorization.

## 5. Buyer System
Buyer/company profiles may include:
- Company name
- Contact person
- Country
- WhatsApp/phone
- Email
- Registration information
- Verification status
- Supporting documents

Buyer requirements should support:
- Commodity/product
- Specification/grade
- Trial quantity
- Required/monthly quantity
- Contract duration
- Target price
- Currency
- Incoterm
- Destination port/location
- Payment terms
- Inspection requirements
- Additional conditions
- Requirement status

## 6. Seller System
Seller/company profiles may include:
- Company name
- Contact
- Country
- WhatsApp/phone
- Email
- Registration information
- Verification status
- Supporting documents
- Export capability where relevant

Seller offers/products should support:
- Product
- Specification
- Origin
- Available quantity
- Monthly capacity
- MOQ
- Price
- Currency
- Incoterm
- Loading port/location
- Payment terms
- Inspection terms
- Availability/status

## 7. Verification
Trust and verification are core UDC functions.

Possible states:
- UNVERIFIED
- DOCUMENTS_SUBMITTED
- UNDER_REVIEW
- VERIFIED
- REJECTED
- SUSPENDED

Maintain verification history and audit records.

AKIF may extract information, compare records and flag inconsistencies, but sensitive verification decisions remain with authorized humans/admins.

Discovery is not verification.

## 8. Matching Engine
UDC should match buyer requirements and seller offers using relevant fields such as:
- Product
- Specification
- Quantity/capacity
- Price/target range
- Origin restrictions
- Destination
- Incoterm
- Payment terms
- Inspection requirements
- Availability
- Verification state

For the MVP, automated recommendations plus manual/admin approval are acceptable.

Later AKIF can provide match scoring and explain why a match is suitable.

Never fabricate a match when no real corresponding data exists.

## 9. Deal Engine
An approved match can become a UDC deal with a unique deal ID.

Store as applicable:
- Buyer
- Seller
- Associated agent(s)
- Product
- Specification
- Quantity
- Price
- Currency
- Transaction value
- Incoterm
- Origin
- Destination
- Payment terms
- Inspection terms
- Contract duration
- Commission structure
- Documents
- Current stage/status
- Timeline/history
- Notes/audit information

Possible stages include:
- Requirement submitted
- Matching
- Offer
- Buyer review
- Negotiation
- Verification
- LOI
- ICPO
- FCO/SCO
- SPA/Contract
- Banking
- Inspection
- Loading
- Shipment
- Destination inspection/delivery
- Payment
- Commission
- Completed

Also support:
- ON_HOLD
- CANCELLED
- REJECTED
- DISPUTED

Do not force every deal through every stage. International trade procedures vary by transaction.

## 10. Documents
Securely upload/store/review documents and associate them with the correct company, user and/or deal.

Examples may include:
- Company registration documents
- Trade/export documents
- LOI
- ICPO
- FCO/SCO
- SPA/contract
- NCNDA
- IMFPA
- Invoices
- Product certificates
- Proof of Product where applicable
- Inspection/SGS reports
- Shipping documents
- Bills of Lading
- Other deal evidence

Later AKIF can extract information, compare documents to stored terms, identify inconsistencies and assist drafting.

Do not treat automated document analysis as final legal or authenticity verification.

## 11. Payment and Banking Workflow
Deals may use agreed methods/instruments such as:
- LC
- DLC
- SBLC
- BG
- TT

Relevant banking/SWIFT messages or evidence may include, where applicable:
- MT700
- MT705
- MT799
- MT103

Do not hard-code one payment structure for every transaction.

Store the terms actually agreed for each deal and relevant evidence/status.

UDC/AKIF is not a bank and must not imply otherwise.

## 12. Inspection and Shipment
Track, where relevant:
- Inspection provider
- Inspection location
- Inspection status
- Inspection documents
- Warehouse/loading status
- Shipment status
- Shipping documents
- Destination
- Delivery/destination inspection

SGS or other legitimate inspection providers may be used depending on the transaction.

Do not hard-code one universal inspection procedure.

## 13. Commission Engine
UDC's primary business model is commission from successful transactions.

Support flexible structures:
- Percentage of transaction
- Fixed amount per MT
- Buyer-side commission
- Seller-side commission
- Agent/broker allocations
- Other explicitly agreed structures

Track:
- Expected commission
- Calculation method/rate
- Who pays
- Currency
- Expected amount
- Received amount
- Payment status
- Associated deal

Never assume a fixed commission for all deals.

## 14. Agents / Brokers / Referrals
Agents may introduce legitimate buyers or sellers.

Store:
- Who made the introduction
- Buyer/seller introduced
- Date/time/history
- Associated deal
- Agreed commission/reward where applicable

Future protection may include:
- Introduction audit trails
- Broker association with deals
- NCNDA/IMFPA records
- Commission allocation
- Anti-bypass supporting records

## 15. Admin Control Center
Admin capabilities should eventually include:
- Buyer management
- Seller management
- Agent management
- Verification review
- Requirements
- Offers
- Match review/approval
- Deal management
- Document review
- Inspection tracking
- Shipment tracking
- Commission tracking
- Disputes
- Notifications
- Audit history
- Manual intervention

Human control is especially important in the first version.

## 16. Discovery / Data Engine
AKIF may eventually help discover legitimate buyers, sellers and opportunities using approved/permitted data sources.

Requirements:
- Preserve source/provenance.
- Avoid duplicate leads.
- Distinguish discovery from verification.
- Never invent contact details or opportunities.
- Do not claim a discovered company is verified without the verification workflow.

## 17. AKIF Learn
AKIF should eventually help beginners understand:
- Import/export basics
- Incoterms
- Trade terminology
- Documents
- Payment instruments
- Inspection
- Shipping
- UDC workflows

Users should not need to already be trade experts to use UDC.

## 18. Legal / Document Screening
UDC may provide basic automated document screening and later authorized human/lawyer review workflows.

A low-cost basic screening concept has been discussed.

Never represent automated screening as a full legal opinion.

## 19. Notifications
Notification events can include:
- Verification submitted/approved/rejected
- New requirement/offer match
- Offer received
- Missing document
- Document approved/rejected
- Deal-stage change
- Inspection update
- Shipment update
- Payment-stage update
- Commission update

WhatsApp is the preferred early communication channel.

## 20. Product Strategy
Initial focus is copper, including examples such as:
- Copper Cathode
- Copper Millberry Scrap
- Copper Wire Scrap

But the architecture must remain commodity-agnostic.

Future categories may include:
- Sugar
- Food products
- Agricultural commodities
- Metals
- Other legitimate import/export commodities

Do not permanently hard-code the system around copper.

## 21. Security Principles
- Use proper authentication and authorization.
- Use role-based/least-privilege access.
- Protect sensitive commercial documents.
- Never expose secrets in frontend/client code.
- Use environment variables/secrets.
- Maintain audit/history records for important actions.
- Users must only access information they are authorized to see.
- Validate inputs.
- Treat uploaded documents and external content as untrusted data.

## 22. Current Technical Direction
Use the EXISTING repository and architecture.

The backend/database direction uses Supabase/PostgreSQL.

Existing working functionality must be preserved.

Before modifying:
1. Inspect existing code.
2. Understand the current architecture.
3. Identify what already works.
4. Reuse it.
5. Make the smallest safe change.
6. Test the change.
7. Continue incrementally.

Do not create duplicate systems because a feature already exists under a different name.

## 23. Current MVP Priority
Focus on this path:

Real WhatsApp
→ AKIF
→ UDC Backend/API
→ Supabase
→ Buyer/Seller onboarding
→ Requirements/Offers
→ Manual verification
→ Matching
→ Deal creation
→ Documents
→ Deal/status tracking
→ Commission tracking

Manual admin control is acceptable and preferred for sensitive operations in the MVP.

Do not build every future feature at once.

## 24. Long-Term Direction
Possible future capabilities include:
- More advanced AKIF reasoning and workflow orchestration
- Voice/document/image understanding
- AI-assisted document generation
- Controlled buyer/seller outreach
- Advanced opportunity discovery
- Risk/fraud indicators
- Demand aggregation
- Logistics integrations
- Inspection integrations
- Banking/financial partner integrations
- Analytics
- More commodities/countries
- Dedicated UDC application/chat interface

These are future capabilities, not permission to implement everything now.

## 25. Coding-Agent Rules
Always follow these rules:

1. Read this AGENTS.md before working.
2. Inspect existing code before changing it.
3. Never rebuild working functionality unnecessarily.
4. Never delete working functionality without a clear requirement.
5. Avoid duplicate models/routes/services.
6. Make small, incremental changes.
7. Test important changes.
8. Preserve existing architecture unless there is a concrete technical reason to change it.
9. Do not implement future features merely because they are documented here.
10. Keep responses concise to conserve Codex usage.
11. The owner is learning development; explain required manual actions simply.
12. Never expose credentials or secrets.
13. Do not invent UDC business data.
14. For high-risk verification, legal, banking and trade decisions, preserve human/admin control.
15. When asked for the next step, select ONE highest-priority step rather than starting many unrelated changes.
16. If requirements conflict with the current implementation, explain the conflict before making a destructive architectural change.

## 26. Default First Task for a New Coding Agent
If no more specific task is supplied:

DO NOT MODIFY CODE.

Inspect the repository and report only:
1. Already working
2. Partially working
3. Missing for the current MVP
4. Critical technical problems
5. The single best next implementation step

Keep the report concise.

## 27. AKIF Open-Source Intelligence Strategy
Current architecture decision:

- Keep AKIF inside the existing UDC TypeScript backend. Do not replace UDC with a separate CRM/backend.
- TradeCRM (Apache-2.0) is an approved architectural reference for buyer discovery, company enrichment, shipment intelligence, trade-interest mapping and agent workflows. Reuse compatible ideas/modules selectively; do not import its whole Python stack into UDC.
- Keep AKIF research provider-neutral. Official trade data, customs/shipment data, company sources, sanctions/compliance sources and future commercial APIs must plug into the AKIF provider interface and preserve provenance.
- Every discovered company/opportunity must retain source evidence, retrieval timestamps and confidence. Discovery is never equivalent to verification.
- Opportunity scoring must remain explainable and assistive. Compliance, verification, legal, banking and transaction approvals remain human-controlled.
- Prefer provider-neutral/self-hostable AI model interfaces rather than hard-wiring AKIF to one model vendor.
- Add a graph/agent orchestration framework only when AKIF has genuine multi-step tool workflows that need durable state; do not add orchestration complexity prematurely.
- Any third-party source code incorporated into UDC must comply with its license and retain required notices/attribution.


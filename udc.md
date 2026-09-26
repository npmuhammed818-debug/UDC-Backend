# UDC CONTEXT / CODEX HANDOVER

## 1. Project identity

Project name: UDC
Meaning: UpDownCircle

UDC is a B2B import/export platform. The long-term vision is broader than a simple supplier directory or Alibaba-style marketplace.

Core idea:
UDC helps legitimate buyers and sellers discover each other, verify participants, coordinate trade requirements and documents, coordinate the transaction, and help move a deal toward completion. UDC earns a transaction commission when a deal closes.

Simple vision:
Akif creates opportunities.
Newcomers discover opportunities.
Agents bring participants.
UDC verifies everyone.
UDC aggregates legitimate demand where appropriate.
UDC coordinates the transaction.
The trade closes.
UDC earns its transaction commission.
Eligible referrers earn their agreed reward.

Do NOT frame UDC as guaranteed income, direct selling, or a get-rich-quick system.

---

## 2. Business model

Current preferred revenue model:
- UDC earns a commission per successful transaction.
- Older ideas involving mandatory buyer/seller fees should NOT replace the current commission-per-transaction model unless explicitly changed later.
- Referral agents can receive an agreed reward when a referred transaction actually closes.

UDC can eventually operate around:
- Marketplace
- Transaction coordination
- Verification
- Trade intelligence
- Documents
- Payment-flow coordination
- Inspection
- Logistics/status
- Learning/Academy
- Referral network
- Opportunity discovery

Potential initial trade categories discussed:
- Copper, especially copper cathode / Millberry
- Sugar
- Other legitimate B2B commodities and products later

Important:
Start narrow enough to validate the workflow. A previous validation direction was to manually facilitate one legitimate copper cathode transaction before trying to build every feature.

---

## 3. UDC users

### Buyer
A buyer can:
- Define product requirement
- Enter quantity
- Enter target price or commercial requirements
- Upload required documents
- Provide address/company information
- Review matched sellers/opportunities
- Communicate with sellers through UDC
- Participate in contract/payment/inspection/logistics workflow

### Seller
A seller can:
- Submit company/product information
- Upload required verification/product documents
- Become visible for relevant verified opportunities after verification
- Respond to buyer requirements
- Upload packing/shipping/status information
- Communicate through UDC
- Participate in contracts and transaction workflow

Latest preference:
Seller/product verification should be manually controlled initially rather than blindly automated.

### Agent / Referrer
Agents can:
- Bring legitimate buyers or sellers
- Refer participants
- Track referral status
- Earn an agreed reward when the referred deal actually closes

The referral model must be tied to real transaction value, not recruitment for its own sake.

### Admin / UDC operations
Admins need to:
- Verify users and documents
- Review opportunities
- Manage deals
- Monitor transaction status
- Control sensitive documents
- Manage disputes/issues
- Approve sensitive automated actions
- Maintain audit records
- Manage commissions and referral rewards

---

## 4. Core transaction concept

A simplified original UDC transaction flow:

1. Buyer submits a requirement.
2. UDC identifies relevant verified sellers.
3. Seller responds with commercial terms.
4. Buyer/seller information and documents are verified.
5. Contract and transaction structure are coordinated.
6. Payment instrument / LC process is coordinated according to the actual deal and applicable banking/legal requirements.
7. Seller prepares and ships goods.
8. Seller uploads packing/shipping/status information.
9. Tracking/status is available through UDC or trusted external sources.
10. Inspection such as SGS can be coordinated where required.
11. Buyer completes the agreed payment/release process.
12. Seller receives funds according to the transaction arrangement.
13. UDC records and takes its agreed transaction commission.
14. Eligible referrer receives the agreed reward.
15. The deal is marked closed with an audit trail.

IMPORTANT:
Do not hard-code legal or banking claims into the software. Actual LC/DLC/payment, contract, inspection, customs and trade rules depend on the jurisdiction, banks, commodity and deal. The platform should support configurable workflows and human/legal/banking review where needed.

---

## 5. Documents and trade workflow

The first MVP was intentionally kept simpler:
- Buyer/company information
- Address
- Required documents
- LC/payment evidence or relevant payment workflow

Later phases can add:
- FCO
- LOI
- SPA
- User-entered clauses
- Other trade documents

The platform should allow legitimate user-entered contractual clauses where appropriate, while avoiding the claim that UDC itself is providing legal advice.

Document requirements:
- Role-based access
- Strong privacy controls
- Encryption in transit and at rest where supported
- Audit logs
- Access history
- Retention/deletion policy
- Do not expose documents to unrelated users
- Human verification for important documents initially

---

## 6. Akif / A.K.

Akif is NOT a separate company/product from UDC.
Akif (also referred to as A.K. in newer naming) is the intelligence layer inside UDC.

Its job is to help UDC understand trade data and surface opportunities.

Akif should help with:
- Global trade data analysis
- Supply discovery
- Demand discovery
- Product matching
- Buyer/seller matching
- Price analysis
- Landed-cost analysis
- Margin estimation
- Risk analysis
- Market/opportunity research
- Verification support
- Opportunity scoring/explanation
- Newcomer education
- Trade workflow assistance

Akif should NOT:
- Pretend uncertain information is verified
- Automatically close deals without appropriate human controls
- Bypass verification
- Invent suppliers/buyers
- Present estimates as guaranteed profits
- Make legal/banking decisions on its own
- Spam people

Akif opportunity output should ideally explain:
- Opportunity
- Product
- Origin/destination
- Supply/demand evidence
- Approximate price information
- Required capital
- MOQ
- Required documents
- Estimated margin/range where supportable
- Complexity
- Risks
- Data source
- Timestamp
- Confidence/uncertainty

---

## 7. Akif data sources

Planned legitimate/public or properly licensed sources discussed include:
- UN Comtrade
- WTO data/resources
- World Bank WITS
- ITC Trade Map
- ITC Market Access Map
- UNCTADstat
- UN trade/tariff resources
- National customs/statistical portals
- Other sources only where access/use is permitted

The system should maintain a source/provenance register.

For every important data point, preserve where practical:
- Source
- Retrieval timestamp
- Product classification
- Geography
- Period
- Transformation/normalization steps
- Confidence/quality notes

Do not scrape or reuse restricted data in violation of terms.

---

## 8. Newcomer opportunity system

A major UDC goal is to help newcomers and smaller legitimate businesses discover realistic trade opportunities.

Akif should surface opportunities in understandable language.

Each opportunity can show:
- What is being bought/sold
- Where demand exists
- Where supply exists
- MOQ
- Required capital
- Documents needed
- Estimated economics
- Complexity
- Risks
- Suggested next step

Where appropriate and legitimate, smaller buyer requirements may be aggregated to meet supplier MOQ or a required DLC/transaction threshold.

Aggregation must NOT:
- Create fake demand
- Hide the true parties
- Circumvent compliance
- Create misleading transaction representations

---

## 9. UDC Learn / Academy

UDC should eventually contain a learning area for newcomers.

Topics:
- Import/export basics
- Finding buyers
- Finding suppliers
- Incoterms
- LC / DLC basics
- Trade documents
- Shipping
- Customs
- Inspection / SGS
- Negotiation
- Fraud and trade risks
- How UDC works
- Referral basics

Akif can act as a tutor.
Potential learning features:
- Lessons
- Simple explanations
- Quizzes
- Practice scenarios
- Deal simulations

---

## 10. Chat and WhatsApp direction

Earlier architecture considered a WhatsApp bot.

Current direction:
WhatsApp should primarily be a communication channel, while UDC should eventually have its own simple WhatsApp-like in-app chat.

The UDC chat should support:
- Buyer/seller messaging
- Akif participation
- Deal-linked conversations
- Document sharing with permissions
- Notifications
- Auditability where legally appropriate

If WhatsApp integration is used:
- Use official Meta/WhatsApp APIs
- Obtain appropriate user consent/opt-in
- Provide opt-out
- Respect templates/rate limits/policies
- Avoid spam
- Do not use unofficial automation to bypass platform rules

Sensitive actions should have appropriate human approval.

---

## 11. Existing technical foundation

Known project foundation:
- UDC backend exists
- Replit workspace was used for development
- Workspace path previously used: `/home/runner/workspace`
- Backend area: `artifacts/api-server`
- Important backend files previously observed include:
  - `src/app.ts`
  - `src/index.ts`
  - routes/services
- `app.ts` mounts the `/api` router
- `GET /api/healthz` previously returned HTTP 200 with `UDC is running`

Database:
- Supabase is connected
- Runtime database connection previously used:
  - `SUPABASE_DATABASE_URL`
  - pooler / port 6543 / pgbouncer
- Direct connection previously used:
  - `SUPABASE_DIRECT_URL`
  - port 5432

IMPORTANT:
Before changing architecture or database tables, inspect the existing repository and current Supabase schema. Do not rebuild working functionality from scratch.

---

## 12. GitHub / Codex handover rules

Repository context:
The UDC backend has been kept in GitHub, and GitHub was connected for development/Codex workflow.

Codex should:
1. Read this file first.
2. Inspect the repository.
3. Inspect package/config files.
4. Inspect existing routes/services.
5. Inspect database/schema/migrations.
6. Determine what is already implemented.
7. Run existing tests/build/lint where available.
8. Only then propose or make changes.

Critical rule:
DO NOT assume that a feature is missing just because it is not described here.
Inspect the actual code.

Critical rule:
DO NOT delete or replace working UDC functionality without understanding dependencies.

Critical rule:
Preserve existing APIs where possible. If breaking changes are necessary, document them.

---

## 13. Security principles

UDC will handle commercially sensitive information.

Required principles:
- Least-privilege access
- Role-based authorization
- Secure authentication
- Server-side authorization checks
- Secure secrets/environment variables
- Never expose service-role/database secrets to frontend
- Protect uploaded documents
- Signed/temporary access where appropriate
- Audit sensitive actions
- Validate uploaded files
- Prevent unauthorized cross-user data access
- Rate limit public/sensitive endpoints
- Validate and sanitize input
- Protect against common web/API vulnerabilities
- Do not log passwords, tokens, private documents or unnecessary sensitive information
- Use secure payment/banking integrations rather than storing sensitive banking credentials unnecessarily

Before production:
- Security review
- Privacy policy
- Terms
- Data retention policy
- Incident handling
- Appropriate legal/compliance review

---

## 14. Transaction / commission protection

UDC needs a reliable internal transaction ledger.

Track at minimum:
- Deal ID
- Buyer
- Seller
- Agent/referrer if applicable
- Product
- Quantity
- Agreed transaction value
- UDC commission rule
- Commission amount
- Deal status
- Payment status
- Referral reward status
- Timestamps
- Audit events

The system should make it difficult to bypass a valid commission arrangement after UDC creates or coordinates a deal.

However:
Do not create deceptive, coercive or legally invalid restrictions. Commission protection should be implemented through clear contracts/terms and transparent transaction records.

---

## 15. Suggested high-level architecture

Frontend:
- Buyer dashboard
- Seller dashboard
- Agent dashboard
- Admin dashboard
- Deal/workflow screens
- Chat
- Documents
- Opportunity discovery
- Learn/Academy

Backend:
- Auth
- Users/organizations
- Verification
- Products
- Requirements
- Matching
- Opportunities
- Deals
- Documents
- Messaging
- Payments/payment-status integration
- Shipping/status
- Inspection
- Commission ledger
- Referral ledger
- Notifications
- Audit logs
- Akif services

Akif/data layer:
- Source registry
- Data ingestion
- Normalization
- Product/entity matching
- Opportunity engine
- Risk engine
- Market analysis
- Recommendation/explanation layer
- Provenance

Database:
- PostgreSQL/Supabase
- Strong row-level access controls where appropriate
- Proper foreign keys
- Indexes for common searches
- Audit/event records
- Secure storage for documents

---

## 16. Development philosophy

Build in stages.

Stage 1:
Make the core UDC marketplace and transaction workflow reliable.

Stage 2:
Verification + document controls.

Stage 3:
Deal/commission/referral ledger.

Stage 4:
Chat.

Stage 5:
Akif data/opportunity engine.

Stage 6:
Learn/Academy.

Stage 7:
External communication integrations and larger automation.

Do not attempt to make every AI feature perfect before validating whether real users will use UDC.

A real transaction is more valuable as validation than a huge collection of unused features.

---

## 17. Current priority

The immediate objective is to get UDC genuinely operational, not just visually impressive.

Priority order:
1. Understand current codebase.
2. Make sure backend/API/database work together.
3. Establish reliable authentication/authorization.
4. Complete buyer/seller/admin core workflow.
5. Complete verification/document workflow.
6. Complete deal/commission/referral tracking.
7. Test the complete workflow end-to-end.
8. Then expand Akif and other advanced modules.

---

## 18. How Codex should work with the user

The user prefers simple, direct explanations.

When making changes:
- Explain what you found.
- Explain what you are changing.
- Make changes in small logical groups.
- Run tests after changes.
- Report exactly what passed/failed.
- Do not claim something is completed unless it was actually implemented and tested.
- If something cannot be verified, say so clearly.
- Prefer working code over unnecessary complexity.

The user wants the project built, not just discussed.

---

## 19. Definition of success

UDC is successful at the MVP level when a legitimate buyer can:
- Sign in
- Submit a real requirement
- Be matched with verified sellers
- Review relevant information
- Communicate
- Complete required documents
- Progress through a structured deal workflow
- Track deal status
- Complete the agreed transaction process
- Have UDC's commission recorded correctly
- Have an eligible referral reward recorded correctly

And an admin can:
- Verify parties
- Control documents
- Manage deals
- Audit actions
- Resolve operational issues

Akif then becomes an intelligence layer that increases the quality and quantity of legitimate opportunities without pretending certainty.

---

## 20. Codex first instruction

Before coding, do this:

"Read UDC_CONTEXT.md completely. Then inspect the entire current repository and database-related code. Compare the actual implementation against this context. Create a concise implementation/status report showing:
1. What is already working.
2. What is partially implemented.
3. What is missing.
4. What is broken.
5. What should be built next.
Do not rewrite or delete anything until the existing architecture is understood."

After that, continue implementation from the actual repository state.

END OF UDC CONTEXT

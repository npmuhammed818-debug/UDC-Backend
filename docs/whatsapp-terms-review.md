# WhatsApp terms review and verification gates

DLC direct to seller after SGS at destination is the default recommendation. Pending buyer requirements and seller offers preserve explicitly proposed payment terms and remain private for review. Paragraph intake accepts all eleven Incoterms and a named delivery place.

After approving a match, an administrator uses Send terms to buyer on WhatsApp in the matching desk. The server reads approved records and checks both accounts, companies and approved evidence. Exact quantity, price, delivery, inspection and payment terms are stored in an immutable audit proposal. Full terms are sent without truncation, followed by Agree / Find another seller buttons. No payment is executed.

Only the verified buyer bound to the proposal can respond, through the existing signed, consent-gated WhatsApp webhook. Proposals expire after 24 hours; changed terms, stale revisions, duplicate decisions and unrelated recipients cannot grant consent. A different payment route cannot open a deal without matching buyer consent. Deal creation and the accepted snapshot are atomic. Document drafts and AI memory use that snapshot rather than later listing edits.

Rejecting terms retains the original requirement, declines this match and ranks further real approved offers from verified sellers with approved company evidence. It creates at most one next suggested match for admin review; it does not fabricate supply or contact another seller automatically. Admin approval of the suggested match rechecks eligibility.

Existing DLC payment-stage evidence checks remain. Alternative payment stages need admin review and an approved evidence document belonging to the deal. These are operational records, not bank transfers, bank approval or a guarantee of safety.

Validation: API build, isolated route/transport tests, exact-consent, stale/expired proposal, ownership, duplicate, audit rollback, rematching, immutable draft terms and company evidence gates. Live buyer/seller WhatsApp acceptance still needs checking. Native Meta popup form publication remains separate from buttons and guided chat. WhatsApp referral consent is recorded separately from commission and private deal access. Admin-triggered company PDF screening uses existing extraction/model services, caches by document and company-profile fingerprint, and never approves documents or companies. Scanned/unreadable PDFs remain for manual review. Full live buyer/seller/agent acceptance remains required.

Company review supports pending, under_review, verified and rejected. Company/document state, audit history and notifications commit atomically. Buyer/seller account approval requires reviewed company evidence; rejecting the last approved document returns the company and verified trader to review. Agents do not need company evidence. Repeated unchanged reviews do not duplicate audit events or notifications.

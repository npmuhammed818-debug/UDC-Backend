# Email channel pilot

User request Nov 4, 23:36 PST: UDC should work through email as well as WhatsApp for companies that prefer email. Staging/synthetic foundation only. No customer inbox read or real send.

## Intended route
Authenticated inbound event for udc@updowncircle.site -> sender verification and existing account binding -> same account history and AKIF rules -> read-only response draft -> human review. Gmail/Outlook/etc are customer mail apps, not separate brains.

The current source adapter is a synthetic seam, not a mailbox integration or working email service. It requires provider-owned webhook authentication plus DMARC-aligned From evidence supplied independently of MIME text. Display name, forwarded text, signature, claimed account ID and Reply-To cannot bind an account. Exact address binding must be verified separately. Plus tags/dots are never collapsed. Existing verified account and consent required. Unknown senders need an onboarding/verification flow that remains to be built.

## Current safe subset
- Exact recipient mailbox, no CC or reply-all; changed Reply-To and groups held for audience review.
- Auto-submitted/bulk loop suppression, message-ID dedup, bounded subject/text, header-injection rejection.
- Read-only draft capability, no deal/order/payment/tool execution. Email body is untrusted evidence, never owner/platform authority.
- Reply draft goes only to authenticated bound sender, same thread, no attachment. Explicit draft-not-sent status.
- Attachment metadata allowlist for PDF/JPEG/PNG, 20MB each, five maximum. All attachments are held for private review, not parsed, fetched, relayed or trusted. Need actual-byte sniffing/scanning, scoped private upload, extraction and grant checks before enabling.

## Remaining before real use
Choose and verify mailbox-provider receive/send support and ownership. Build signed-event receiver, sender enrollment, read-only brain adapter, reply/outbox receipts, template/abuse/rate controls, unsubscribe/consent rules, private storage, malware/type checks and exact deal/attachment grants. Never share a trader's old seller records across a new deal. No public mailbox or send configuration changed in this work.

Email parity is separate from the current 37 feature count. Foundation can proceed alongside staged work; real connection and sending need separate user authority and testing.

## Existing WhatsApp trader continuity
User clarified at 23:38 that the email must be the address registered on the existing WhatsApp account. The synthetic linking contract therefore looks up that current registration, creates a two-minute code challenge, and requires confirmation by the independently verified current WhatsApp account. New arbitrary email addresses cannot select a user ID or merge by name. Code is hashed, max-five/single-use and budgeted via atomic storage contract; production repository/receiver remains unimplemented and disabled. After a verified binding, the same account-keyed history is used, with existing deal and document permissions on every read. Phone/email changes and account revocation must invalidate bindings before launch.

Unknown new buyers need separate email-code verification, consent/onboarding and human account approval. That workflow is not yet implemented and cannot read existing trader history.

Native SQL binding repository added, still unconnected to any inbox or real provider. It uses current registered address/phone/status plus an injected current-consent resolver; hashes code and phone binding, rate-budgets three/hour and one/minute, max-five attempts, atomic single use and 30-day binding expiry. Resolve rechecks current registration, status, consent and phone fingerprint each time. Executed against disposable native PostgreSQL: parallel confirmation produces one binding, shared account history key, changed email/phone and suspension deny resolution. No live account or inbox effects. A production consent implementation, signed email receiver and verified-WhatsApp confirmation route are still needed.

The synthetic chain now also has an admin-only fixture HTTP receiver, a signed-fixture check (explicitly not provider authentication), atomic SQL message dedup, private SQL draft save, and the signed-WhatsApp pipeline's LINK EMAIL command consumed before model routing. A current-consent resolver reads the same fingerprint/version/status evidence as WhatsApp, including withdrawal denial. An exact-deal history read uses existing WhatsApp deal-event rows, returns the current account's own originals and only successfully relayed counterpart text, and denies non-parties/agents, unrelated accounts and withdrawn consent. Native SQL+actual HTTP execution proved signed fixture -> linked sender -> safe original history -> draft_not_sent; parallel replay yields one draft. No actual model invoked; this is bounded history/draft behavior, not full AKIF conversation parity. Raw incoming fixture text cannot execute trade commands.

Remaining: real provider choice, true provider-signature and sender-security implementation, durable retry/outbox/receipt state, new-buyer onboarding, full read-only AKIF brain integration, private attachment scanning/extraction, explicit unlink/revocation UI and deployment/mailbox/sending approval. Claimed fixture sender authentication must never be reused as live DMARC evidence. All fixture endpoints stay staging+synthetic+reply-sink-only. Linking/resolution expire after 30 days and recheck current consent/account/address/phone; changing away then back does not itself erase past audit evidence. Explicit permanent revocation remains to build.

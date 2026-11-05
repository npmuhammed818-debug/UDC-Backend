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

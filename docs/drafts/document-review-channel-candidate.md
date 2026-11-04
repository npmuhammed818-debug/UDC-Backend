# Local candidate - not deployed

Two foundations prepared on branch staging/document-review-portable-chat, based on staging54011b0. No hosted SQL, sends, production or public-site changes.628API regressions and typecheck passed. This is NOT a finished customer flow.

## Document review
Staging-gated route candidate uses authenticated verified buyer/seller identity, explicit document grant and deal membership, approved document status, managed storage path, byte/revision hash,15minute token, origin+confirmation check, per-link transaction lock and reviewed-only audit receipt. GET cannot approve. Version/access checked each time. Existing audit table reused, no migration. Native PDF content only, no active office/HTML embeds.

Missing before deployment: real SQL route/transaction tests for current grant and concurrent revocation; actual authenticated synthetic PDF browser preview (initial static screenshot failed because fixture content route was absent); complete mobile rendering and receipt/back-to-chat verification; approved exact origin configuration; a proven mobile-friendly PDF renderer/fallback; customer sign-in-to-recipient-link flow. Current prototype requires a signed-in UDC session, so it is not a true one-tap link for WhatsApp-only customers. Do not weaken identity checks to meet “one tap”. Storage download currently buffers whole document and needs a size-limited streaming implementation before hostile uploads/large files. Do not deploy the candidate as ready.

The user's explicit approval for future real review actions is the person's own checkbox/tap, not owner silence about an implementation plan. The button never accepts an LC, makes a signature, verifies authenticity or authorizes payment.

## Channel separation
Transport-neutral contract and fake-adapter tests show the same internal user ID can be supplied through separately verified WhatsApp/Telegram bindings and provider message deduplication remains channel-namespaced. Unknown identity cannot self-assert a user ID in text.

Not yet wired into existing WhatsApp handler. No Telegram integration, identity-binding store/UI, account merge, channel consent migration or fallback delivery exists. Existing durable deal/user memory remains intact. Next step is extract common conversation service behind the seam, then prove WhatsApp routing unchanged before second adapter. Do not claim full portability from this contract alone.


### Recorded term label safety (synthetic proof)
Counter drafts refuse blank, oversized, multiline and directional-control term labels. Normal international destination names still work. No label is silently cleaned into a different trade term. This is private draft validation, not a send or a change to a deal.

The counter helper also rejects non-string runtime amount and currency values before string operations. Reproduced a numeric amount causing a TypeError; null, array, object and boolean inputs now return the ordinary no-draft error. No coercion to a different amount or currency.

Trial-quantity helpers reject non-string runtime input before exact-decimal processing. Reproduced numeric input throwing during canonicalization; malformed values now return null/false. Existing string decimal canonicalization and positive-reduction arithmetic stay unchanged. No order is created by these helper tests.

Native SQL handler proof stores a blank unit, a multiline destination and a directional-control destination in turn. The actual negotiation handler returns only the normal refusal to the requester, never a counter draft or the unsafe label. Each check compares every stored deal field before/after and verifies it is unchanged. Test transport is synthetic, not WhatsApp/Meta.

A second SQL connection now holds a pending destination correction while the actual counter handler starts. The handler waits, reads the committed unsafe label and refuses instead of drafting from stale terms. The test checks requester-only transport, no leaked unsafe label and the full stored deal remaining unchanged after refusal.

Trial preparation now has native SQL proof for malformed runtime quantities and a source-quantity correction held by a second connection. The actual preparation function waits, rejects a quantity no longer smaller than the corrected original, creates no buyer requirement or success audit, and changes no stored deal field. No customer orders or external transport are involved.

Seller response summary correction: equal-timestamp inbound and outbound rows previously counted as an answered turn or not solely from database return order. Ties now process seller outbound first, so they cannot manufacture a proven reply to the simultaneous inbound. Older pending turns and later timestamped replies still work; the private summary explains the tie limitation. This is activity arithmetic, not a rating or ranking.

Native SQL proof inserts equal-timestamp buyer/seller messages in both physical orders and calls the actual seller scorecard reader. Both return zero proven answers, one unanswered turn and no median, with the tie limitation. The full conversation rows remain unchanged; private account and deal IDs are absent from the summary.

Freight request selection correction: native SQL reproduced preparation finishing against an old selected deal while a selection change was pending. The selected-context read now holds a shared row lock inside the existing preparation transaction. The two-connection test waits for the changed selection, refuses an unavailable deal and creates no freight-request audit. Existing role checks and parallel idempotence still pass. No freight quote, booking or money decision is made.

Same-pair memory selection correction: native SQL reproduced reading old selected-deal history while a selection change was pending. The implicit selected-context read now holds a shared row lock in its existing transaction. A two-connection test waits, sees the committed unavailable selection and returns no pair-history fields or new audit. Explicit deal-reference reads remain independent of chat selection.

Contextual Incoterm-tip correction: native SQL reproduced the actual handler returning the old selected deal's rule while a selection change was pending. The implicit selected-context read now holds a shared row lock. The handler waits, sees the committed unavailable selection and returns only the requester-side no-private-term fallback. Existing exact-rule explanations and no-term-mutation checks still pass.

Status-picture selection correction: native SQL reproduced the actual handler generating a picture from the old selection while a selection change was pending. The context read now holds a shared row lock inside the existing handler transaction. The test waits, sees the committed unavailable selection and emits only the requester-side fallback with no PNG. No picture rendering or design changed.

Trial current-role proof: a second native SQL connection holds a pending buyer-to-seller role change. Actual preparation waits, then returns forbidden after that change commits, with no new requirement or success audit. This tests the existing account lock and does not change role policy or create an order.

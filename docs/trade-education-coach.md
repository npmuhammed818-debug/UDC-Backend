
### Recorded term label safety (synthetic proof)
Counter drafts refuse blank, oversized, multiline and directional-control term labels. Normal international destination names still work. No label is silently cleaned into a different trade term. This is private draft validation, not a send or a change to a deal.

The counter helper also rejects non-string runtime amount and currency values before string operations. Reproduced a numeric amount causing a TypeError; null, array, object and boolean inputs now return the ordinary no-draft error. No coercion to a different amount or currency.

Trial-quantity helpers reject non-string runtime input before exact-decimal processing. Reproduced numeric input throwing during canonicalization; malformed values now return null/false. Existing string decimal canonicalization and positive-reduction arithmetic stay unchanged. No order is created by these helper tests.

Native SQL handler proof stores a blank unit, a multiline destination and a directional-control destination in turn. The actual negotiation handler returns only the normal refusal to the requester, never a counter draft or the unsafe label. Each check compares every stored deal field before/after and verifies it is unchanged. Test transport is synthetic, not WhatsApp/Meta.

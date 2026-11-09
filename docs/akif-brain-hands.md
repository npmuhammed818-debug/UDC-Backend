# AKIF brain and hands

Status: built for staging tests, OFF by default. No Anthropic key required to test.

- `AKIF_BRAIN_HANDS_ENABLED=on` selects the split. Leave unset for current synchronous behavior.
- With `AKIF_BRAIN_MODEL_PROVIDER=anthropic` and an Anthropic key, Sonnet chooses work and writes customer replies, while Haiku selects the exact bounded tool calls and returns results.
- Without that configuration, both slots use Groq. This tests the flow, not Claude quality.
- Existing 13 tools plus the new trade-reference tool remain behind their existing handlers. No money, commission-change or approval tool is added.
- The brain replies that work is pending before the hands start. A second message can be answered during work, but cannot start another action batch for that customer.
- Hands cannot add an action, change arguments or repeat an action within a batch. Failed actions are not retried automatically.
- The final customer reply goes through the existing delivery path, validators and staging sink/allowlist. Failed initial delivery cancels unstarted work.
- Session markers record pending or unverified work. There is no durable job resumption: a restart interrupts work, marks its effects unverified on the next turn and does not replay it.
- Cancellation stops work not started; it cannot undo an action already completed.
- All model calls use the existing call-count and concurrency guards. The split can use four calls for a tool turn: brain plan, brain acknowledgement, hands, brain result.
- ImpexQ mock figures are never passed to either model. Only FTA reference data can be returned, with source and eligibility caveats.

Tests use synthetic data only. No new schema or migration. Enabling the split and enabling paid model access are separate decisions.

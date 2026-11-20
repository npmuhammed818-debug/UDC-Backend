// Send registry (review candidate, 18 Nov): one structured log line per
// outbound content-message POST call's final outcome, so a delivered message
// is attributable after an incident (18 Nov 14:27: a visible reply had no
// identifiable send path in any ledger). Privacy-minimized by construction:
// caller tag, payload type tag, origin call-site tag, inbound correlation
// id, provider message id, service/version and outcome ONLY - never body
// text, tokens, recipients, media or provider error payloads. Correlation
// and provider ids are sensitive access-restricted operational metadata,
// not anonymous data. Logging never throws and never changes a return value.
//
// Coverage is deliberately narrow: only the six content-message transport
// functions in client.ts log, and only the final outcome of each call.
// Excluded (no registry line): voice-note staging-sink early return,
// media pre-POST upload failures, read/typing markers, scope prechecks
// and intermediate 429 attempts.
//
// origin/inbound describe the async creation/execution scope a send runs
// in, NOT synchronicity with any turn. An async resource created inside a
// run (timer, pending delivery) retains that run's store even after the
// run's callback settles; a function invoked later by an unstamped caller
// runs in the caller's (null) context. Background or scripted sends may
// therefore log either an inherited run-scoped origin or nulls - nulls
// mean "no boundary in this chain", not "no send happened".
import { AsyncLocalStorage } from "node:async_hooks";

export type SendOutcome = "submitted" | "provider_error" | "unknown" | "blocked_scope" | "sunk";
export type SendContext = { inbound?: string; origin?: string };

const context = new AsyncLocalStorage<SendContext>();

/** Run-scoped context at a bounded origin call site (brain turn, brain-reply
 *  deliver, relay-answer deliver): the store applies to fn's async subtree
 *  only and the outer context is restored when fn settles. */
export function runWithSendContext<T>(ctx: SendContext, fn: () => Promise<T>): Promise<T> {
  return context.run(ctx, fn);
}

export function logOutboundSend(input: {
  caller: string;
  type: string;
  outcome: SendOutcome;
  providerMessageId?: string | null;
  httpStatus?: number | null;
}): void {
  try {
    const store = context.getStore();
    console.info("UDC outbound send", {
      caller: input.caller,
      type: input.type,
      origin: store?.origin ?? null,
      inbound: store?.inbound ?? null,
      providerMessageId: input.providerMessageId ?? null,
      service: process.env.RENDER_SERVICE_NAME ?? "udc-api",
      version: process.env.RENDER_GIT_COMMIT ?? null,
      outcome: input.outcome,
      httpStatus: input.httpStatus ?? null,
    });
  } catch { /* logging must never break a send */ }
}

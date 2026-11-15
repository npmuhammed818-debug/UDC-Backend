// Pure helper so the "message relayed" claim can be tested without WhatsApp or a database.
// sendWhatsAppText does not throw when nothing was sent (not configured) or when Meta's outcome is unknown;
// it returns { delivered: false, reason }. Only an explicit delivered: true counts as passed on.
export type RelaySendResult = { delivered?: boolean; reason?: string } | null | undefined;

export function relayWasDelivered(result: RelaySendResult): boolean {
  return result?.delivered === true;
}

export function relayOutcomeNote(result: RelaySendResult, otherRole: string, dealNumber: string): string {
  if (relayWasDelivered(result)) {
    return `The customer's message was relayed to the ${otherRole} for deal ${dealNumber}. Tell the customer you passed it on to the ${otherRole} and will come back here with their reply. Never share the ${otherRole}'s contact details.`;
  }
  if (result?.reason === "provider_outcome_unknown") {
    return "The relay may not have reached the other party; delivery could not be confirmed. Do not say it was passed on and do not promise a reply. Tell the customer you could not confirm it was delivered.";
  }
  return "The relay could not be sent just now and nothing will be retried automatically. Do not say it was passed on. Tell the customer it did not go through and ask them to send it again in a little while.";
}

// A reply that says the other party was told, or that their answer is coming, is false when nothing was confirmed sent.
const RELAY_CLAIM = /\b(?:pass(?:ed|ing)\b|relayed|forwarded|sent (?:it|that|your message|the message)|delivered|told (?:him|her|them|the (?:buyer|seller))|let (?:him|her|them|the (?:buyer|seller)) know|(?:come|get) back (?:here )?with|their (?:reply|answer|response))\b/i;
const RELAY_HONEST = /\b(?:could ?n[o']t|can ?n[o']t|unable|did ?n[o']t|was ?n[o']t|not (?:been )?(?:sent|delivered|confirmed|passed)|did not go through)\b/i;

// Existing customer-facing clause for a failed relay (same wording as the photo relay failure in routes/whatsappWebhook.ts).
// Returning null here is NOT safe: the webhook re-runs the whole brain turn once on a null, which could send the relay twice.
export const RELAY_NOT_PASSED_REPLY = "I could not pass it to the other side just now.";

/** Relay was not confirmed delivered: a model reply that claims otherwise is replaced by the existing failure clause.
 *  Replies that already say it was not sent or not confirmed are kept. */
export type RelayUndelivered = false | "not_sent" | "unknown";
// Wording for an uncertain delivery, as shown to the owner in WhatsApp on Nov 15 2026 before this change.
export const RELAY_UNCONFIRMED_REPLY = "I couldn't confirm whether the message went through.";

export function guardRelayClaim(reply: string | null, relayUndelivered: RelayUndelivered | boolean): string | null {
  if (!relayUndelivered || !reply) return reply;
  if (RELAY_HONEST.test(reply)) return reply;
  if (!RELAY_CLAIM.test(reply)) return reply;
  return relayUndelivered === "unknown" ? RELAY_UNCONFIRMED_REPLY : RELAY_NOT_PASSED_REPLY;
}

/** Which relay result classes mean the original may already have gone out. */
export function relayUndeliveredKind(result: RelaySendResult, threw: boolean): RelayUndelivered {
  if (!threw && result?.delivered === true) return false;
  return !threw && result?.reason === "provider_outcome_unknown" ? "unknown" : "not_sent";
}

// Brain turns that already did an external send. The webhook must not re-run such a turn: a re-run could send twice.
const externalSends: Map<string, number> = ((globalThis as { __akifExternalSends?: Map<string, number> }).__akifExternalSends ??= new Map<string, number>());
const sendKey = (phone: string, messageId?: string) => `${phone}|${messageId ?? ""}`;
export function noteExternalSend(phone: string, messageId?: string, now = Date.now()) {
  for (const [k, t] of externalSends) if (now - t > 15 * 60_000) externalSends.delete(k);
  externalSends.set(sendKey(phone, messageId), now);
}
export function brainTurnHadExternalSend(phone: string, messageId?: string): boolean {
  return externalSends.has(sendKey(phone, messageId));
}
export function resetExternalSendsForTest() { externalSends.clear(); }

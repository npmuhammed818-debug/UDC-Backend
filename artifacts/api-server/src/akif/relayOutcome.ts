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
const RELAY_CLAIM = /\b(?:passed (?:it |that |your message )?on|relayed|forwarded|sent (?:it|that|your message|the message)|delivered|told (?:him|her|them|the (?:buyer|seller))|let (?:him|her|them|the (?:buyer|seller)) know|(?:come|get) back (?:here )?with|their (?:reply|answer|response))\b/i;
const RELAY_HONEST = /\b(?:could ?n[o']t|can ?n[o']t|unable|did ?n[o']t|was ?n[o']t|not (?:been )?(?:sent|delivered|confirmed|passed)|did not go through)\b/i;

/** Relay was not confirmed delivered: a model reply that claims otherwise is dropped (null = existing scripted fallback chain).
 *  Replies that already say it was not sent or not confirmed are kept. */
export function guardRelayClaim(reply: string | null, relayUndelivered: boolean): string | null {
  if (!relayUndelivered || !reply) return reply;
  if (RELAY_HONEST.test(reply)) return reply;
  return RELAY_CLAIM.test(reply) ? null : reply;
}

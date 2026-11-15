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
  return "The relay could not be sent just now; tell the customer you will try again shortly.";
}

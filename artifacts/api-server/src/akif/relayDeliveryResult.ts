/** What a relay worker is told when a reply was not confirmed accepted by Meta. Three different facts, never merged:
 *  - failed: Meta rejected this attempt. That proves this attempt was not accepted, not that another worker has not sent since.
 *  - unknown: timeout, network error or 5xx. Meta may have accepted it. Do not resend blindly.
 *  "Accepted" is the API saying it took the message. It does not prove the handset received it. */
export function relayDeliveryFailureBody(reason: string | undefined): { ok: false; error: "delivery_failed"; reason?: string; outcomeUnknown: boolean; attemptNotAccepted: boolean; message: string } {
  const unknown = reason === "provider_outcome_unknown";
  return {
    ok: false,
    error: "delivery_failed",
    reason,
    outcomeUnknown: unknown,
    attemptNotAccepted: !unknown,
    message: unknown
      ? "Outcome unknown. WhatsApp did not answer in time, so the customer may already have this message. Do not resend yet. Check the conversation first. The item is still open."
      : "Not sent. WhatsApp did not accept the message. This attempt was not accepted. Refresh the item and check the conversation before you try again, in case another worker already answered. The item is still open.",
  };
}

/** What a relay worker is told when a reply was not confirmed accepted by Meta. Three different facts, never merged:
 *  - failed: Meta rejected it or it never left. Safe to retry.
 *  - unknown: timeout, network error or 5xx. Meta may have accepted it. Do not resend blindly.
 *  "Accepted" is the API saying it took the message. It does not prove the handset received it. */
export function relayDeliveryFailureBody(reason: string | undefined): { ok: false; error: "delivery_failed"; reason?: string; outcomeUnknown: boolean; retrySafe: boolean; message: string } {
  const unknown = reason === "provider_outcome_unknown";
  return {
    ok: false,
    error: "delivery_failed",
    reason,
    outcomeUnknown: unknown,
    retrySafe: !unknown,
    message: unknown
      ? "Outcome unknown. WhatsApp did not answer in time, so the customer may already have this message. Do not resend yet. Check the conversation first. The item is still open."
      : "Not sent. WhatsApp did not accept the message. The item is still open and it is safe to try again.",
  };
}

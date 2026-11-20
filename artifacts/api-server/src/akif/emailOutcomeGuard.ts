// Pure helpers so the "code sent" claim can be tested without a database or a mail transport.
export const EMAIL_UNAVAILABLE_REPLY = "Email verification is unavailable right now. Please try again later.";

const FALLBACK_NO_REPLY = "Send Verify email first so I can email you a fresh 6-digit code.";

/** What the verification step really returned, as the model must see it, plus the tool's own final wording. */
export function emailToolOutcome(reply: string | null | undefined): { note: string; finalReply: string; unavailable: boolean } {
  const finalReply = reply ?? FALLBACK_NO_REPLY;
  return {
    note: `Email verification result (state exactly this meaning, never say a code was sent unless this says so): ${finalReply}`,
    finalReply,
    unavailable: finalReply === EMAIL_UNAVAILABLE_REPLY,
  };
}

// Any wording that implies a message went out or is on its way, or tells the customer to look for one.
const SENT_CLAIM = /\b(?:sent|sending|send|delivered|emailed|e-?mailed|mailed|on (?:its|the) way|coming|inbox|check your (?:e-?mail|mail)|verification code|6[- ]?digit|code)\b/i;

/** Delivery really failed: a model reply that implies a code went out is false, so the tool's own wording replaces it.
 *  Replies that make no such claim (for example only confirming a saved registration) are left alone. */
export function guardEmailClaim(reply: string | null, emailUnavailable: boolean): string | null {
  if (!emailUnavailable || !reply) return reply;
  return SENT_CLAIM.test(reply) ? EMAIL_UNAVAILABLE_REPLY : reply;
}

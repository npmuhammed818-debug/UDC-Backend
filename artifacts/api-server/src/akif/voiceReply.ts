// Decides whether a reply may be spoken. Conservative: generic text only, because free-tier
// Gemini content may be read by reviewers and must not carry personal or deal details.
export const VOICE_REPLY_MAX_CHARS = 350;

export function speechTextAllowed(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t || t.length > VOICE_REPLY_MAX_CHARS) return false;
  return !/\d|https?:|www\.|@|[$€£₹#]/i.test(t);
}

export function voiceRepliesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env["AKIF_VOICE_REPLIES"] === "on";
}

/** Audio only when the user spoke to us, the feature is on, and the reply is generic. */
export function shouldSpeakReply(input: { userSentVoice: boolean; reply: string | null | undefined; enabled?: boolean }): boolean {
  return (input.enabled ?? voiceRepliesEnabled()) && input.userSentVoice && speechTextAllowed(input.reply);
}

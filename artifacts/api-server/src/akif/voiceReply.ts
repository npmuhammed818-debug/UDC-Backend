import { AI_FALLBACK_REPLY, HUMAN_HANDOFF_REPLY } from "./conversationPolicy.ts";

// Default-deny: only fixed, reviewed sentences may ever be spoken. Model-generated or
// user-derived text is never sent to the speech provider, because names, companies and
// addresses cannot be reliably detected, and free-tier Gemini content may be read by reviewers.
export const SPEAKABLE_STATIC_REPLIES: ReadonlySet<string> = new Set([HUMAN_HANDOFF_REPLY, AI_FALLBACK_REPLY]);

export function speechTextAllowed(text: string | null | undefined): boolean {
  return typeof text === "string" && SPEAKABLE_STATIC_REPLIES.has(text);
}

export function voiceRepliesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env["AKIF_VOICE_REPLIES"] === "on";
}

/** Audio only when the user spoke to us, the feature is on, and the exact text is on the allowlist. */
export function shouldSpeakReply(input: { userSentVoice: boolean; reply: string | null | undefined; enabled?: boolean }): boolean {
  return (input.enabled ?? voiceRepliesEnabled()) && input.userSentVoice && speechTextAllowed(input.reply);
}

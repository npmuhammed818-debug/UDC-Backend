import { speechKind, speechBlockReason, voiceRepliesEnabled } from "../akif/voiceReply.ts";
import { reserveSpeech } from "../akif/voiceLimits.ts";
import { synthesizeAkifSpeechTimed } from "../akif/intelligence/workerClient";
import { runConversationChat } from "../akif/intelligence/hermesClient";
import { spokenTextFor } from "../akif/voiceScript.ts";
import type { VoiceLanguage } from "../akif/voiceLanguage.ts";
import { sendWhatsAppVoiceNote } from "./client";
import { getVoiceState, recordNotice } from "./voicePreference";

export type SpeakFailure =
  | "master_off" | "not_speakable" | "text_only" | "preferences_unavailable"
  | "daily_limit" | "notice_save_failed" | "synthesis_or_send_failed";
export type SpeakResult = { status: boolean | "uncertain"; seconds: number | null; noticeDue: boolean; language?: VoiceLanguage; reason?: SpeakFailure; detail?: string };

/** The brain rewrites the approved English reply in the customer's language, for speech only. */
async function translateForSpeech(reply: string, language: Exclude<VoiceLanguage, "english">): Promise<string | null> {
  const { content } = await runConversationChat(
    `Rewrite this exact WhatsApp reply in natural spoken ${language}, as a caring human trade agent would say it. ` +
    `Keep the same meaning and length, no lists, no links, no numbers with four or more digits, no currency amounts, no dates. ` +
    `Return only the rewritten sentence(s), nothing else.\n\n${reply}`,
    "You rewrite short customer-service messages into another language for speaking aloud. You never add facts, numbers, links or promises. You output only the rewritten message.",
    15_000,
  );
  return typeof content === "string" ? content : null;
}

/**
 * Speak a reply. status false is always a known pre-send failure (feature off, text not speakable, text only,
 * daily limit, provider error), so the caller sends text instead. "uncertain" means the voice submission may
 * have gone out and no second message may follow. noticeDue is true once per user: the short notice is then
 * sent as text. Audio and reply text are never logged.
 */
export async function speakReply(to: string, reply: string, options: { language?: VoiceLanguage } = {}): Promise<SpeakResult> {
  const none = (reason: SpeakFailure): SpeakResult => ({ status: false, seconds: null, noticeDue: false, reason });
  const kind = speechKind(reply);
  if (kind === "none") { const r = none(voiceRepliesEnabled() ? "not_speakable" : "master_off"); r.detail = speechBlockReason(reply) ?? undefined; return r; }
  const state = await getVoiceState(to);
  if (state === "text_only") return none("text_only");
  if (state !== "voice" && state !== "needs_notice") return none("preferences_unavailable"); // fail closed
  // Voice in their language or English (AKIF's pick, made by the caller). The translated text is
  // checked again before it can reach the provider; any doubt falls back to the English reply.
  const spoken = await spokenTextFor(reply, options.language ?? "english", translateForSpeech);
  if (kind === "conversational" && !reserveSpeech(to, spoken.text.trim().length)) return none("daily_limit");
  let noticeDue = false;
  if (state === "needs_notice") { if (!(await recordNotice(to))) return none("notice_save_failed"); noticeDue = true; }
  try {
    const { bytes, seconds } = await synthesizeAkifSpeechTimed(spoken.text, kind === "conversational", spoken.language);
    const result = await sendWhatsAppVoiceNote(to, bytes);
    return { status: !result.delivered && result.reason === "provider_outcome_unknown" ? "uncertain" : result.delivered, seconds, noticeDue, language: spoken.language };
  } catch {
    return none("synthesis_or_send_failed");
  }
}

/** Compatibility wrapper: true, false or "uncertain". */
export async function trySpeakReply(to: string, reply: string): Promise<boolean | "uncertain"> {
  return (await speakReply(to, reply)).status;
}

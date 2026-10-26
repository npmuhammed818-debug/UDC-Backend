import { speechKind } from "../akif/voiceReply.ts";
import { reserveSpeech } from "../akif/voiceLimits.ts";
import { synthesizeAkifSpeechTimed } from "../akif/intelligence/workerClient";
import { sendWhatsAppVoiceNote } from "./client";
import { getVoiceState, recordNotice } from "./voicePreference";

export type SpeakResult = { status: boolean | "uncertain"; seconds: number | null; noticeDue: boolean };

/**
 * Speak a reply. status false is always a known pre-send failure (feature off, text not speakable, text only,
 * daily limit, provider error), so the caller sends text instead. "uncertain" means the voice submission may
 * have gone out and no second message may follow. noticeDue is true once per user: the short notice is then
 * sent as text. Audio and reply text are never logged.
 */
export async function speakReply(to: string, reply: string): Promise<SpeakResult> {
  const none: SpeakResult = { status: false, seconds: null, noticeDue: false };
  const kind = speechKind(reply);
  if (kind === "none") return none;
  const state = await getVoiceState(to);
  if (state !== "voice" && state !== "needs_notice") return none; // text only, or preferences unavailable: fail closed
  if (kind === "conversational" && !reserveSpeech(to, reply.trim().length)) return none;
  let noticeDue = false;
  if (state === "needs_notice") { if (!(await recordNotice(to))) return none; noticeDue = true; }
  try {
    const { bytes, seconds } = await synthesizeAkifSpeechTimed(reply, kind === "conversational");
    const result = await sendWhatsAppVoiceNote(to, bytes);
    return { status: !result.delivered && result.reason === "provider_outcome_unknown" ? "uncertain" : result.delivered, seconds, noticeDue };
  } catch {
    return none;
  }
}

/** Compatibility wrapper: true, false or "uncertain". */
export async function trySpeakReply(to: string, reply: string): Promise<boolean | "uncertain"> {
  return (await speakReply(to, reply)).status;
}

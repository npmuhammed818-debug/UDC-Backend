import { speechKind } from "../akif/voiceReply.ts";
import { reserveSpeech } from "../akif/voiceLimits.ts";
import { synthesizeAkifSpeech } from "../akif/intelligence/workerClient";
import { sendWhatsAppVoiceNote } from "./client";
import { getVoiceState, recordNotice, VOICE_NOTICE } from "./voicePreference";

/**
 * Speak a reply to a user who sent a voice note. Returns false for every known pre-send failure
 * (feature off, text not speakable, daily limit, provider error) so the caller sends text instead.
 * An ambiguous voice submission returns "uncertain" and must not trigger a second message.
 * Audio and reply text are never logged.
 */
export async function trySpeakReply(to: string, reply: string): Promise<boolean|"uncertain"> {
  const kind = speechKind(reply);
  if (kind === "none") return false;
  if (await getVoiceState(to) !== "voice") return false; // notice not shown yet, text only, or preferences unavailable
  if (kind === "conversational" && !reserveSpeech(to, reply.trim().length)) return false;
  try {
    const result=await sendWhatsAppVoiceNote(to,await synthesizeAkifSpeech(reply, kind === "conversational"));
    return !result.delivered&&result.reason==='provider_outcome_unknown'?'uncertain':result.delivered;
  } catch {
    return false;
  }
}

/** Text to append to a text reply the first time voice would have been used: the plain-words notice. Null otherwise. */
export async function voiceNoticeFor(to: string, reply: string): Promise<string | null> {
  if (speechKind(reply) === "none") return null;
  if (await getVoiceState(to) !== "needs_notice") return null;
  return (await recordNotice(to)) ? VOICE_NOTICE : null;
}

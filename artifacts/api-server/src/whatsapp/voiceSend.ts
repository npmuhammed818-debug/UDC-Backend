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
  if (kind === "none") {
    console.info("AKIF voice reply skipped", JSON.stringify({ stage: "eligibility", reason: "reply_not_speakable_or_voice_disabled" }));
    return none;
  }
  const state = await getVoiceState(to);
  if (state !== "voice" && state !== "needs_notice") {
    console.warn("AKIF voice reply skipped", JSON.stringify({ stage: "preference", reason: state === "unavailable" ? "voice_preference_unavailable" : "text_only" }));
    return none; // fail closed: never bypass the user's voice preference or consent notice
  }
  if (kind === "conversational" && !reserveSpeech(to, reply.trim().length)) {
    console.info("AKIF voice reply skipped", JSON.stringify({ stage: "limits", reason: "speech_limit_reached" }));
    return none;
  }
  let noticeDue = false;
  if (state === "needs_notice") {
    if (!(await recordNotice(to))) {
      console.warn("AKIF voice reply skipped", JSON.stringify({ stage: "preference", reason: "voice_notice_could_not_be_recorded" }));
      return none;
    }
    noticeDue = true;
  }
  try {
    const { bytes, seconds } = await synthesizeAkifSpeechTimed(reply, kind === "conversational");
    if (!bytes.length) {
      console.warn("AKIF voice reply failed", JSON.stringify({ stage: "synthesis", reason: "empty_audio" }));
      return none;
    }
    const result = await sendWhatsAppVoiceNote(to, bytes);
    const status = !result.delivered && result.reason === "provider_outcome_unknown" ? "uncertain" : result.delivered;
    console.info("AKIF voice reply result", JSON.stringify({ stage: "delivery", status, seconds, audioBytes: bytes.length, kind }));
    return { status, seconds, noticeDue };
  } catch (error) {
    // Never log message text, audio, recipient identifiers, provider bodies, or secrets.
    console.warn("AKIF voice reply failed", JSON.stringify({ stage: "synthesis_or_delivery", errorType: error instanceof Error ? error.name : "unknown" }));
    return none;
  }
}

/** Compatibility wrapper: true, false or "uncertain". */
export async function trySpeakReply(to: string, reply: string): Promise<boolean | "uncertain"> {
  return (await speakReply(to, reply)).status;
}

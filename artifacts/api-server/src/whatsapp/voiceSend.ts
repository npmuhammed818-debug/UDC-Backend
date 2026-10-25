import { shouldSpeakReply } from "../akif/voiceReply.ts";
import { synthesizeAkifSpeech } from "../akif/intelligence/workerClient";
import { sendWhatsAppVoiceNote } from "./client";

/** Draft: speak a generic reply to a user who sent a voice note. Known pre-send failures permit text fallback; ambiguous voice submission must not trigger a second message. */
export async function trySpeakReply(to: string, reply: string): Promise<boolean|"uncertain"> {
  if (!shouldSpeakReply({ userSentVoice: true, reply })) return false;
  try {
    const result=await sendWhatsAppVoiceNote(to,await synthesizeAkifSpeech(reply));
    return !result.delivered&&result.reason==='provider_outcome_unknown'?'uncertain':result.delivered;
  } catch {
    return false;
  }
}

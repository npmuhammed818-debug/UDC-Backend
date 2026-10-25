import { shouldSpeakReply } from "../akif/voiceReply.ts";
import { synthesizeAkifSpeech } from "../akif/intelligence/workerClient";
import { sendWhatsAppVoiceNote } from "./client";

/** Draft: speak a generic reply to a user who sent a voice note. Returns false on any problem so text is sent. */
export async function trySpeakReply(to: string, reply: string): Promise<boolean> {
  if (!shouldSpeakReply({ userSentVoice: true, reply })) return false;
  try {
    return (await sendWhatsAppVoiceNote(to, await synthesizeAkifSpeech(reply))).delivered;
  } catch {
    return false;
  }
}

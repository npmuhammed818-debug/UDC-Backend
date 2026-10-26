// Plain words the owner can approve or change. Shown once as text before the first voice reply.
export const VOICE_NOTICE = "Heads up: I can reply to voice notes with a voice note. Audio is made by ElevenLabs, who also turn your voice note into text. I never speak links, codes or bank details. Send \"text only\" any time to stop voice replies.";
export const TEXT_ONLY_CONFIRMATION = "Okay, I'll reply in text only. Send \"voice on\" if you want voice replies again.";
export const VOICE_ON_CONFIRMATION = "Voice replies are on again for voice notes. Send \"text only\" to stop them.";

export type VoiceCommand = "text_only" | "voice_on" | null;

export function parseVoiceCommand(text: string | null | undefined): VoiceCommand {
  if (typeof text !== "string") return null;
  const t = text.trim().replace(/[.!"'\u201c\u201d]+/g, "").replace(/\s+/g, " ").toLowerCase();
  if (/^(?:text only(?: please)?|stop voice(?: replies| notes)?|no voice(?: replies| notes)?|only text|don'?t (?:send|reply with) voice(?: notes)?)$/.test(t)) return "text_only";
  if (/^(?:voice on|voice replies on|turn on voice(?: replies)?|use voice(?: replies)?)$/.test(t)) return "voice_on";
  return null;
}


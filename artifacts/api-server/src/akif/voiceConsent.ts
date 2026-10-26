// Plain words the owner can approve or change. Shown once as text before the first voice reply.
export const VOICE_NOTICE = "Voice replies use ElevenLabs. Send \"text only\" to switch them off.";
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


export const VOICE_TEXT_OFFER = "Want this in text? Reply yes.";
export const EXPLICIT_VOICE_CONFIRMATION = "Okay, I'll answer your next question in voice.";
export const EXPLICIT_VOICE_TEXT_ONLY = "You have text only on. Send \"voice on\" first and I'll use voice.";

/** Exact short phrases only, so normal sentences are never read as a request. */
export function parseVoiceRequest(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  const t = text.trim().replace(/[.!?"'\u201c\u201d]+/g, "").replace(/\s+/g, " ").toLowerCase();
  return /^(?:send (?:me )?(?:a )?voice(?: note| message)?(?: please)?|reply (?:in|with) (?:a )?voice(?: note)?(?: please)?|answer (?:in|with) (?:a )?voice(?: note)?|voice (?:reply|please)|in voice please)$/.test(t);
}

/** A yes to the text offer. Only used while an offer for that user is pending. */
export function isOfferYes(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  return /^(?:yes|yeah|yep|yup|sure|ok|okay|please|yes please|sure please|send it|send text|text please)$/i.test(text.trim().replace(/[.!"'\u201c\u201d]+/g, "").replace(/\s+/g, " "));
}

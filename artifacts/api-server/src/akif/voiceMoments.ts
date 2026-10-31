// Master Plan v3, voice rules (28 Oct): AKIF may choose voice by itself, like a human - but never
// about dates or money, and only for these moments: calming an upset user, replying to a voice
// note, or explaining something long. No voice in the welcome message. Everything starts text;
// voice needs the master switch (AKIF_VOICE_REPLIES=on) AND this autopick switch
// (AKIF_VOICE_AUTOPICK=on). Both are off by default. The privacy rules in voiceReply.ts run after
// this pick, so a moment never makes an unsafe reply speakable.
import { classifyReply, voiceRepliesEnabled } from "./voiceReply.ts";

export function voiceAutopickEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return voiceRepliesEnabled(env) && env["AKIF_VOICE_AUTOPICK"] === "on";
}

// Conservative upset markers: clear anger or frustration only. Ordinary complaints phrased calmly
// stay text - a wrong voice note is worse than a missed one.
const UPSET = /\b(?:angry|furious|upset|frustrat\w*|annoyed|disappoint\w*|unhappy|not happy|fed up|sick of|terrible|horrible|worst|useless|ridiculous|unacceptable|wasting my time|waste of time|this is a scam|cheat(?:ing|ed)?|fraud)\b|(?:^|\s)(?:why (?:is|does|did) (?:this|it|udc) (?:always|not|still))(?:\s|$)/i;

export function detectUpset(userText: string | null | undefined): boolean {
  return typeof userText === "string" && UPSET.test(userText);
}

const LONG_EXPLANATION_CHARS = 240;

export type VoiceMoment = "calming" | "long_explanation";

/**
 * AKIF's own voice pick for a reply to a TEXT message (voice-in mirroring is handled by the caller).
 * Returns null unless autopick is on, the user sounds upset or the reply is a long explanation, and
 * the reply itself is speakable (never dates, money, terms, links or other critical content).
 */
export function voiceMomentFor(input: {
  userText: string | null | undefined;
  reply: string | null | undefined;
  env?: Record<string, string | undefined>;
}): VoiceMoment | null {
  const env = input.env ?? process.env;
  if (!voiceAutopickEnabled(env)) return null;
  if (classifyReply(input.reply) === "critical") return null;
  if (detectUpset(input.userText)) return "calming";
  if (typeof input.reply === "string" && input.reply.trim().length >= LONG_EXPLANATION_CHARS) return "long_explanation";
  return null;
}

/** The full channel choice for one reply. Voice-in and explicit requests stay as the caller decided. */
export function chooseChannel(input: {
  wantsVoice: boolean;
  userText?: string | null;
  reply: string | null | undefined;
  env?: Record<string, string | undefined>;
}): { channel: "voice" | "text"; moment: VoiceMoment | "mirror" | "explicit" | null } {
  if (input.wantsVoice) return { channel: "voice", moment: null };
  const moment = voiceMomentFor({ userText: input.userText, reply: input.reply, env: input.env });
  return moment ? { channel: "voice", moment } : { channel: "text", moment: null };
}

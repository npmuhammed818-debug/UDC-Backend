// Spoken text for a voice reply. Text replies are always English (Master Plan v3); a voice reply
// may be in the customer's own language. The brain rewrites the already-approved English reply in
// the target language for speaking aloud; the result is checked again before it can reach the
// speech provider. Any doubt: English, then the normal privacy rules decide.
import { MAX_SPOKEN_CHARS } from "./voiceReply.ts";
import type { VoiceLanguage } from "./voiceLanguage.ts";

// Digits in every script we speak: Latin, Arabic-Indic, Extended Arabic-Indic, Devanagari,
// Malayalam, Tamil. A run of 4+ is a detail (phone, account, tracking) and stays unspoken; the
// English source reply already passed the stricter money/terms/date rules.
const DIGIT_RUN = /[\d\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u0D66-\u0D6F\u0BE6-\u0BEF]{4,}/;
const UNSPEAKABLE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|in|io|site|app|co)\b|[^\s@]+@[^\s@]+\.[^\s@]+|[$\u20AC\u00A3\u20B9﷼]/i;

export function translatedSpeechOk(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_SPOKEN_CHARS) return false;
  if (DIGIT_RUN.test(trimmed)) return false;
  return !UNSPEAKABLE.test(trimmed);
}

export type TranslateForSpeech = (reply: string, language: Exclude<VoiceLanguage, "english">) => Promise<string | null>;

/**
 * The exact text to speak. English replies are spoken as-is. For another language the translator
 * (the brain, wired by the caller) rewrites the reply; the rewrite must pass the speech checks or
 * the caller falls back to the English original. The translator never sees anything but the reply
 * text and the language name.
 */
export async function spokenTextFor(
  reply: string,
  language: VoiceLanguage,
  translate?: TranslateForSpeech,
): Promise<{ text: string; language: VoiceLanguage }> {
  if (language === "english") return { text: reply, language };
  if (!translate) return { text: reply, language: "english" };
  try {
    const translated = await translate(reply, language);
    if (translated && translatedSpeechOk(translated)) return { text: translated.trim(), language };
  } catch { /* fall through to English */ }
  return { text: reply, language: "english" };
}

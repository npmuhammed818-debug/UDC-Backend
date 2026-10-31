// Master Plan v3, language rule (28 Oct): AKIF asks each person their main language as a simple
// choice. Text is always English. Voice is their language or English - AKIF picks per customer.
// The pick is deterministic and fails safe: a known main language wins, then the language of the
// voice note they sent, and English whenever unsure. Only languages the speech worker accepts.
export const VOICE_LANGUAGES = ["english", "malayalam", "hindi", "tamil", "arabic"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

const ALIASES: Record<string, VoiceLanguage> = {
  english: "english", eng: "english", en: "english",
  malayalam: "malayalam", mal: "malayalam", ml: "malayalam",
  hindi: "hindi", hin: "hindi", hi: "hindi",
  tamil: "tamil", tam: "tamil", ta: "tamil",
  arabic: "arabic", ara: "arabic", ar: "arabic",
};

export function normalizeVoiceLanguage(name: string | null | undefined): VoiceLanguage | null {
  if (typeof name !== "string") return null;
  return ALIASES[name.trim().toLowerCase()] ?? null;
}

/** AKIF's per-customer pick: their chosen main language, else the language of their voice note, else English. */
export function pickVoiceLanguage(input: { mainLanguage?: string | null; heardLanguage?: string | null }): VoiceLanguage {
  return normalizeVoiceLanguage(input.mainLanguage) ?? normalizeVoiceLanguage(input.heardLanguage) ?? "english";
}

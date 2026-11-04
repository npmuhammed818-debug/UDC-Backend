// A full name is a short run of letters. Reject text that is clearly a command, question or sentence so
// "Show my requirement" is never stored as someone's name. Deliberately permissive for real names
// (hyphens, apostrophes, dots, non-Latin scripts, several words).
const NOT_A_NAME_START = /^(?:show|what|how|why|when|where|who|give|list|send|tell|please|i\s+(?:need|want|am|would|can)|my\s+(?:status|requirement|offer)|status|requirement|offer|help|menu)\b/i;
export function looksLikeFullName(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (/[@?!:;/\\<>{}[\]=_]/.test(t)) return false;
  if (t.split(/\s+/).length > 6) return false;
  if (NOT_A_NAME_START.test(t)) return false;
  return true;
}
export const NAME_REJECTION = "Please send your name only, for example Asha Verma.";

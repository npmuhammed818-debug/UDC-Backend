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

// A company or place name is a short proper-noun phrase, never a request,
// question or sentence. Company names may carry digits and & . ' , - ( ).
// The guided direct-answer path already rejects this junk class for every
// scalar field; the two other capture paths (LLM tool save, bare-answer
// capture) did not, and "Pls explain in Malayalam" was stored as a company
// name (17 Nov intake incident). This guard closes both.
const NOT_A_COMPANY_START = /^(?:pls|please|show|what|how|why|when|where|who|give|list|send|tell|explain|teach|speak|talk|answer|help|menu|status|i\s+(?:need|want|am|would|can)|we\s+(?:need|want|are|sell|buy|have)|my\s+(?:status|requirement|offer)|yes|no|ok|okay|thanks|thank\s+you|hi|hello|hey)\b/i;
// Question words in Malayalam/Tamil script ("what", "how") - never part of a
// company name. Language or country WORDS are deliberately NOT rejected: real
// names like "Malayalam Traders" or "Tamil Nadu Minerals" must pass; the
// request shapes are caught by the starter and sentence checks above/below.
const QUESTION_WORD_SCRIPT = /എന്ത്|എങ്ങനെ|என்ன|क्या|कैसे/;
export function looksLikeCompanyName(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 100) return false;
  if (/[@?!:;/\\<>{}[\]=_]/.test(t)) return false;
  if (t.split(/\s+/).length > 7) return false;
  if (!/\p{L}/u.test(t)) return false;
  if (NOT_A_COMPANY_START.test(t)) return false;
  if (QUESTION_WORD_SCRIPT.test(t)) return false;
  if (/\b(?:is|am|are|email|country|quantity|price|incoterm|seller|buyer)\b/i.test(t)) return false;
  if (/\bcompany\s+name\b/i.test(t)) return false;
  return true;
}
export const COMPANY_REJECTION = "Please send your company name only, for example UpDownCircle Trading LLC.";

// Pure helpers for "make it shorter" requests. No I/O, tested like intentPhrases.
const BREVITY_PHRASES: RegExp[] = [
  // summary, summery (typo), summarise/-ize(d), "need a summary", "give me a summary"
  /^(?:(?:please|pls|plz)\s+)?(?:(?:i\s+)?(?:need|want)\s+(?:a\s+)?)?(?:(?:give|send)\s+(?:me\s+)?(?:a\s+)?)?summ?[ae]r?[iy](?:(?:z|s)e?d?)?(?:\s+(?:please|pls|plz))?[.!?\s]*$/i,
  /^tl;?dr[.!?\s]*$/i,
  /^(?:(?:please|pls|plz)\s+)?(?:be\s+|keep\s+(?:it\s+|replies\s+|answers\s+)?)?(?:very\s+|really\s+)?(?:short|shorter|shortest|brief|briefer|concise)(?:\s+please|\s+pls)?[.!?\s]*$/i,
  /^in\s+(?:short|brief)[.!?\s]*$/i,
  /^(?:(?:that|this|it)(?:'s|\s+is|\s+was)?\s+)?too\s+(?:long|much|many\s+words|much\s+text|much\s+writing)[.!?\s]*$/i,
  /^(?:less|fewer)\s+(?:text|words|details?)[.!?\s]*$/i,
  /^make\s+(?:it|this)\s+(?:shorter|briefer|more\s+(?:short|brief|concise))[.!?\s]*$/i,
  /^(?:(?:i\s+)?(?:don.?t|do\s+not)\s+want\s+(?:u|you)\s+to\s+)?(?:don.?t\s+|do\s+not\s+)?(?:text|write|send|type)\s+(?:too\s+|so\s+)?much(?:\s+text)?[.!?\s]*$/i,
];
export function isBrevityRequest(text: string) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= 60 && BREVITY_PHRASES.some((re) => re.test(t));
}

const DETAIL_PHRASES: RegExp[] = [
  /^(?:(?:please|pls|plz)\s+)?(?:(?:give|tell)\s+(?:me\s+)?)?more\s+details?(?:\s+please|\s+pls)?[.!?\s]*$/i,
  /^(?:(?:please|pls|plz)\s+)?explain\s+(?:more|in\s+detail)(?:\s+please|\s+pls)?[.!?\s]*$/i,
  /^in\s+detail[.!?\s]*$/i,
  /^(?:full|longer|detailed)\s+(?:answer|explanation|reply)[.!?\s]*$/i,
  /^elaborate[.!?\s]*$/i,
];
export function isDetailRequest(text: string) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= 60 && DETAIL_PHRASES.some((re) => re.test(t));
}

// With the brief preference on, an over-long model reply is trimmed to its
// first two sentences (hard-capped at 60 words) instead of being sent whole.
export function trimToBrief(reply: string): string {
  const trimmed = reply.trim();
  if (trimmed.split(/\s+/).length <= 60) return trimmed;
  const sentences = trimmed.match(/[^.!?\n]+[.!?]+["'”’)\]]*\s*/g) ?? [];
  const kept = sentences.slice(0, 2).join('').trim();
  if (kept && kept.split(/\s+/).length <= 60) return kept;
  return trimmed.split(/\s+/).slice(0, 60).join(' ') + '…';
}

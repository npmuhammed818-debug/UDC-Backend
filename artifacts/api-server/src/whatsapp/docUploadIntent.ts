// Picks a document (or all documents) from a short follow-up to the Upload
// documents list: "1", "1.2.3", "upload 1", "1 , 2 and 3 I wanna upload all of
// it", "all". Bare numbers only count right after the list was shown or as a
// quoted reply to it - otherwise they belong to the normal conversation.
export type DocumentPick = { kind: 'all' } | { kind: 'some'; indexes: number[] };

const DOC_WORDS = /\b(upload|doc|docs|document|documents|link|licen[cs]e|certificate|certificates|tax|registration)\b/i;

export function parseDocumentPick(text: string | null | undefined, docCount: number, contextActive: boolean): DocumentPick | null {
  if (typeof text !== 'string' || docCount < 1) return null;
  const n = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n || n.length > 120) return null;
  const nums = [...new Set((n.match(/\d{1,2}/g) ?? []).map(Number).filter((i) => i >= 1 && i <= docCount))];
  const mentionsDocs = DOC_WORDS.test(n);
  if (/\ball\b/.test(n) && (mentionsDocs || contextActive)) return { kind: 'all' };
  if (mentionsDocs && nums.length) return { kind: 'some', indexes: nums };
  if (contextActive && nums.length && /^[\d\s.,;&+]+$/.test(n.replace(/\band\b/g, ''))) {
    return { kind: 'some', indexes: nums };
  }
  return null;
}

// src/akif/correctionLearning.ts
function looksLikeCorrection(text) {
  const t = text.trim();
  if (t.length < 4 || t.length > 500) return false;
  if (/\b(i meant|i said|correction)\b/i.test(t)) return true;
  if (/^(wrong|that'?s (wrong|not (right|correct|it)))\b/i.test(t)) return true;
  if (/\bnot \d+([.,]\d+)?\b.{0,40}\b\d+([.,]\d+)?\b/i.test(t) && /\b(i meant|should be|it'?s)\b/i.test(t)) return true;
  return false;
}
function isLessonDispute(text) {
  return /\b(that'?s not true|that is not true|that'?s wrong|that is wrong|you'?re wrong|you are wrong|wrong lesson)\b/i.test(
    text.trim()
  );
}
export {
  isLessonDispute,
  looksLikeCorrection
};

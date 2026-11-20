// Pure shared-lesson safety functions (phase 4/6). No database or model
// imports here so every caller - chat, deal outcomes, tests - uses the SAME
// cleaning-or-nothing rule. Owner rule: clean or none, no cheating.

// Identifiers found in the ORIGINAL note become forbidden in the generalized
// lesson: emails, phone-like digit runs, any number of 3+ digits (prices,
// quantities, dates, IDs), and capitalized words of 4+ letters (names,
// companies, places). Caller-supplied profile/deal terms are added on top.
export function forbiddenTermsFrom(sourceText: string, extraTerms: string[] = []): string[] {
  const terms = new Set<string>();
  for (const m of sourceText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+/gi) ?? []) terms.add(m.toLowerCase());
  for (const m of sourceText.match(/\+?\d[\d\s-]{5,}\d/g) ?? []) terms.add(m.replace(/[\s-]/g, ""));
  for (const m of sourceText.match(/\d{3,}/g) ?? []) terms.add(m);
  for (const m of sourceText.match(/\b[A-Z][a-z]{3,}\b/g) ?? []) terms.add(m.toLowerCase());
  for (const term of extraTerms) {
    const clean = term.trim().toLowerCase();
    if (clean.length >= 3) terms.add(clean);
  }
  return [...terms];
}

// The automatic safety check. Any doubt means the lesson stays private and is
// never stored. Checks: leftover identifiers from the source, leftover
// number/email/phone patterns, injection phrasing, and empty output.
export function lessonSafetyCheck(
  generalized: string,
  forbiddenTerms: string[],
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = generalized.trim();
  if (!text || /^NOTHING_GENERAL$/i.test(text)) reasons.push("nothing_general");
  if (text.length > 400) reasons.push("too_long");
  const lower = text.toLowerCase();
  for (const term of forbiddenTerms) {
    if (term && lower.includes(term.toLowerCase())) reasons.push(`identifier:${term.slice(0, 12)}`);
  }
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+/i.test(text)) reasons.push("email_pattern");
  if (/\+?\d[\d\s-]{6,}\d/.test(text)) reasons.push("phone_pattern");
  if (/\d{3,}/.test(text)) reasons.push("number_pattern");
  if (/\b(ignore (all|previous)|you are now|system prompt|new instructions|do not follow)\b/i.test(text)) {
    reasons.push("instruction_phrasing");
  }
  return { ok: reasons.length === 0, reasons };
}


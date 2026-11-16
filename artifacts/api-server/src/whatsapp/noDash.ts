/** User rule, 16 Nov 2026 14:18 IST ("No dash"): customer visible WhatsApp
 *  wording has no dashes between words. Applied at the client send layer so
 *  every scripted, admin and AI text path is covered. Tokens holding digits,
 *  @, / or : (invite codes, emails, links, numeric ranges, negative values)
 *  are left untouched. */
export function noDash(text: string): string {
  return text
    .replace(/(?<=[A-Za-z0-9])\s+[-\u2013\u2014]\s+(?=[A-Za-z])/g, ", ")
    .replace(/(?<=[A-Za-z0-9])[\u2013\u2014]\s*(?=[A-Za-z])/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,([.!?])/g, "$1")
    .replace(/\S+/g, (tok) => /[\d@/:]/.test(tok) ? tok : tok.replace(/(?<=\p{L})[-\u2010-\u2015\u2212](?=\p{L})/gu, " "));
}

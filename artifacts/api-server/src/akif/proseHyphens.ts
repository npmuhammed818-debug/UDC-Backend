/** Permanent structural rule for the owner's "no dash in customer prose" style rule.
 *  No word list. A token is split only when its WHOLE shape is plain lowercase prose:
 *    - 2 or 3 parts, every part 1 to 14 lowercase ASCII letters, joined by single hyphens
 *    - no digits, no uppercase (names, codes, ids, acronyms and dates stay), no @ / : _ . = # ? & % ~
 *      anywhere in the token (urls, emails, paths, file names stay), no quotes or backticks or angle
 *      brackets around it (quoted or code formatted text stays)
 *  Leading and trailing sentence punctuation is kept. Anything else is returned unchanged. */
const PROTECTED = /["'`<>@\/:_=#?&%~\\|*+$^]/;
const WORD = "[a-z]{1,14}";
const SHAPE = new RegExp(`^(?:${WORD}|\\d{1,2})(?:-${WORD}){1,2}$`);
export function splitProseHyphens(text: string): string {
  return text.replace(/\S+/g, (token) => {
    if (!token.includes("-")) return token;
    const m = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9-]+)([^A-Za-z0-9-]*)$/);
    if (!m) return token;
    const [, lead, core, tail] = m;
    if (PROTECTED.test(lead) || PROTECTED.test(tail)) return token;
    if (/[.]/.test(tail.replace(/[.,;:!?]+$/, ""))) return token;
    if (!SHAPE.test(core)) return token;
    return `${lead}${core.split("-").join(" ")}${tail}`;
  });
}

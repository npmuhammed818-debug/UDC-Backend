// UDC never collects or stores Aadhaar numbers or Aadhaar documents.

const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];

function verhoeff(digits: string): boolean {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = D[c]![P[i % 8]![Number(rev[i])]!]!;
  return c === 0;
}

const NUMBER = /(?<!\d)([2-9]\d{3})[\s-]?(\d{4})[\s-]?(\d{4})(?!\d)/g;

/** True when the text holds a 12-digit number that passes the Aadhaar (Verhoeff) check. */
export function containsAadhaarNumber(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  for (const m of text.matchAll(NUMBER)) if (verhoeff(`${m[1]}${m[2]}${m[3]}`)) return true;
  return false;
}

export function mentionsAadhaarDocument(text: string | null | undefined): boolean {
  return typeof text === "string" && /\b(aadhaar|aadhar|adhaar|uidai)\b/i.test(text);
}

/** Replace Aadhaar-valid numbers so they are never stored. */
export function scrubAadhaar(text: string): string {
  return text.replace(NUMBER, (all, a, b, c) => (verhoeff(`${a}${b}${c}`) ? "[aadhaar removed]" : all));
}

export const AADHAAR_REFUSAL =
  "UDC does not collect or store Aadhaar numbers or Aadhaar cards. Please don't send them. If we need to verify you, use another ID such as a passport, through a secure private upload link (send Menu, then Documents).";

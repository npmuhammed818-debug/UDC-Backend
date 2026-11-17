// Pure conversation rules for AKIF. No I/O, no model calls, no invented facts.

const HANDOFF = /\b(?:talk|speak|connect|chat)\s+(?:to|with)\s+(?:a\s+|an\s+|the\s+)?(?:human|person|real person|agent|someone|staff|team|representative|manager|support)\b|\b(?:human|real person|live agent|customer support|customer care|support team)\b.*\b(?:please|need|want|help)\b|\b(?:call me|phone me)\b|\b(?:i (?:want|need) to complain|file a complaint|this is (?:wrong|a scam))\b/i;

export function wantsHumanHelp(text: string | null | undefined) {
  return typeof text === "string" && text.length <= 1000 && HANDOFF.test(text);
}

export const HUMAN_HANDOFF_REPLY =
  "Understood - I've flagged this for the UDC team so a person can follow up with you here. I can't promise an exact time. You can keep asking me questions in the meantime.";

export type Turn = "answer" | "question" | "correction" | "menu_request" | "pause" | "resume";

// Decide how a message relates to the question AKIF last asked. A question or
// correction must never be stored as the answer to the pending field.
export function classifyTurn(text: string, hasPendingQuestion: boolean): Turn {
  const t = text.trim();
  if (/^(?:menu|show menu|open menu)[.!?]*$/i.test(t)) return "menu_request";
  if (/^(?:continue|resume|carry on|go on|back to (?:it|that|my (?:request|offer|registration)))[.!?]*$/i.test(t)) return "resume";
  if (/^(?:wait|hold on|stop|later|not now|pause|never ?mind)[.!?]*$/i.test(t)) return "pause";
  if (/^(?:no[, ]+|sorry[, ]+|actually|i meant|correction|change (?:it|that)|that'?s wrong|not\b)/i.test(t)) return "correction";
  if (/\?\s*$/.test(t) || /^(?:what|why|how|when|where|who|which|can you|could you|do you|does|is it|are you|explain|tell me)\b/i.test(t)) return "question";
  return hasPendingQuestion ? "answer" : "question";
}

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();

// If the same question would be sent again verbatim, rephrase once so the
// customer never gets an identical robotic repeat.
export function avoidRepeat(recentBotMessages: string[], candidate: string, rephrase: (s: string) => string = defaultRephrase) {
  const seen = new Set(recentBotMessages.slice(-3).map(normalise));
  return seen.has(normalise(candidate)) ? rephrase(candidate) : candidate;
}
function defaultRephrase(s: string) {
  return `Just to make sure I have this right - ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
}

// Status replies are composed only from facts the database confirmed.
export type DealFacts = {
  dealStatus?: string | null;
  paymentConfirmedByBank?: boolean;
  inspectionResultOnFile?: "passed" | "failed" | "pending" | null;
  latestTrackingEvent?: { kind: string; at: string; source: string } | null;
};
export function groundedStatusReply(facts: DealFacts | null | undefined) {
  if (!facts) return "I don't have a confirmed record for that yet, so I won't guess. UDC can check it for you.";
  const lines: string[] = [];
  lines.push(facts.dealStatus ? `Deal status on record: ${facts.dealStatus}.` : "No deal status is recorded yet.");
  lines.push(facts.paymentConfirmedByBank ? "Payment: confirmed on record." : "Payment: no bank confirmation on record.");
  lines.push(
    facts.inspectionResultOnFile === "passed" ? "Inspection: a passed result is on file." :
    facts.inspectionResultOnFile === "failed" ? "Inspection: a failed result is on file." :
    facts.inspectionResultOnFile === "pending" ? "Inspection: pending." : "Inspection: no result on file.");
  lines.push(facts.latestTrackingEvent
    ? `Latest shipment event: ${facts.latestTrackingEvent.kind} (${facts.latestTrackingEvent.source}, ${facts.latestTrackingEvent.at}).`
    : "Shipment: no tracking event on record.");
  return lines.join("\n");
}

// Offered when the AI provider fails: honest, short, and it keeps the thread.
export const AI_FALLBACK_REPLY =
  "I couldn't prepare a good answer just now. Nothing you told me was lost. Please try again in a moment, or say 'talk to a person' and I'll flag it for the UDC team.";

// Any sentence that would present a match, price, payment, inspection or shipment
// progress as fact must be backed by a confirmed record; otherwise block it.
// Unverified-fact shapes the model may never assert: money outcomes, deal
// approvals, verification approvals, inspection/shipment events and matches.
// Widened after red-team: previously "payment is approved" slipped through.
const FACT_CLAIM = /\b(?:(?:your |the )?payment (?:is |has been |was |got |went )?(?:approved|received|confirmed|completed|cleared|successful|processed|released|through)|(?:your |the )?(?:deal|order|trade) (?:is |has been |was )?(?:approved|confirmed|finalized|closed)|inspection (?:is |has been |was )?(?:passed|completed|cleared)|shipment (?:has |is |was )?(?:departed|arrived|on its way|cleared customs|delivered)|customs (?:is |has been |was )?cleared|seller (?:has )?accepted|matched you with|(?:you are|you're|your company is|your account is) (?:now )?verified|verification (?:is |has been |was )?(?:approved|passed|complete|completed)|(?:your |the )?documents? (?:are |is |were |have been )?(?:approved|verified))\b/i;
const FACT_NEGATION = /\b(?:not|never|no|cannot|can't|wont|won't|without|awaiting|pending|waiting|yet|unless|if)\b/i;
export function claimsUnverifiedFact(reply: string, verified: { payment?: boolean; inspection?: boolean; shipment?: boolean; match?: boolean }) {
  const m = FACT_CLAIM.exec(reply);
  if (!m) return false;
  // Negation or condition near the claim ("payment is not approved", "no
  // shipment departed yet") is information, not a false assertion.
  const window = reply.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length + 12);
  if (FACT_NEGATION.test(window.replace(m[0], " "))) return false;
  const c = m[0].toLowerCase();
  if (/payment|deal|order|trade/.test(c)) return !verified.payment;
  if (/inspection/.test(c)) return !verified.inspection;
  if (/shipment|customs/.test(c)) return !verified.shipment;
  return !verified.match;
}

// Price grounding (17 Nov live owner test): the model attached the copper
// thread's "5600usd per mt" to a new sugar conversation. A price per unit the
// customer never stated for the CURRENT product thread is a misquote, whether
// the model invented it or carried it over from an older thread.
const COMMODITY_HINTS = ["icumsa", "sugar", "copper", "rice", "wheat", "cement", "steel", "aluminium", "aluminum", "coffee", "tea", "cocoa", "pepper", "cardamom", "cashew", "rubber", "coir", "coconut", "cotton", "textile", "garment", "diesel", "petrol", "gold", "silver", "scrap", "timber", "maize", "corn", "soybean", "palm oil", "urea", "fertilizer", "coal", "clinker", "gypsum", "marble", "granite", "onion", "potato", "mango", "banana", "shrimp", "leather", "plastic", "polymer", "granules", "iron ore", "bauxite", "manganese", "chromite", "laterite"];
function productHintOf(text: string): string | null {
  const t = text.toLowerCase();
  for (const c of COMMODITY_HINTS) if (new RegExp(`\\b${c}\\b`).test(t)) return c;
  return null;
}
/** A trade-intent phrase naming a product we do not recognize ("I sell
 * ferrero rocher", "we supply frozen chicken"): the conservative signal that
 * the customer switched to an uncertain product thread, which must not import
 * prices from an older recognized thread. */
const UNKNOWN_PRODUCT_INTENT = /\b(?:sell|selling|supply|supplying|offer|offering|export|import|need|want|buy|buying|have|got)\s+(?:of\s+|some\s+|a\s+|an\s+)?([a-z][a-z0-9\s]{2,40})/i;
function namesUnknownProduct(text: string): boolean {
  if (productHintOf(text)) return false;
  const m = UNKNOWN_PRODUCT_INTENT.exec(text);
  if (!m) return false;
  const object = m[1].trim().toLowerCase();
  if (!object) return false;
  // Common non-product objects after these verbs are not a product switch.
  if (/^(price|prices|pricing|rate|rates|quote|quotation|offer|offers|details?|info(?:rmation)?|catalog(?:ue)?|sample?s?|payment|lc|tt|documents?|invoice|contract|it|this|that|them|you|u\b)/.test(object)) return false;
  return true;
}
/** The customer's own words in the CURRENT product thread: from the newest
 * message naming the current product back to (not including) the last message
 * naming a different product. A bare message ("My price is 5600usd per mt")
 * continues the thread that was active when it was sent, so an old thread's
 * price is never credited to the new one. An unrecognized/uncertain product
 * switch imports NOTHING from older threads: its grounding set is the
 * switching message alone. No product anywhere in view: the whole
 * conversation (a fresh thread has no older prices to leak). */
export function currentProductUserStatements(history: Array<{ role: string; content: string }>, currentText: string): string[] {
  const userTexts = history.filter((h) => h.role === "user").map((h) => h.content);
  userTexts.push(currentText);
  let running: string | null = null;
  const effective = userTexts.map((t) => { const p = productHintOf(t); if (p) running = p; return running; });
  const current = effective[effective.length - 1];
  if (namesUnknownProduct(userTexts[userTexts.length - 1])) return [userTexts[userTexts.length - 1]];
  if (!current) return userTexts;
  const scoped: string[] = [];
  for (let i = userTexts.length - 1; i >= 0 && effective[i] === current; i--) scoped.unshift(userTexts[i]);
  return scoped;
}
const CURRENCY_SYMBOLS: Record<string, string> = { $: "usd", "\u20AC": "eur", "\u00A3": "gbp", "\u20B9": "inr" };
const CURRENCY_WORDS: Record<string, string> = {
  usd: "usd", dollar: "usd", dollars: "usd", aed: "aed", inr: "inr", rs: "inr",
  eur: "eur", gbp: "gbp", sar: "sar", qar: "qar", kes: "kes", omr: "omr",
  bhd: "bhd", kwd: "kwd", myr: "myr", sgd: "sgd", cny: "cny", rmb: "cny",
  jpy: "jpy", aud: "aud", cad: "cad", zar: "zar", ngn: "ngn", bdt: "bdt",
  pkr: "pkr", lkr: "lkr",
};
const CURRENCY_AMOUNT = /([$\u20AC\u00A3\u20B9]\s?|\b(usd|aed|inr|eur|gbp|sar|qar|kes|omr|bhd|kwd|myr|sgd|cny|rmb|jpy|aud|cad|zar|ngn|bdt|pkr|lkr|rs|dollars?)\b\.?\s?)(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(usd|aed|inr|eur|gbp|sar|qar|kes|omr|bhd|kwd|myr|sgd|cny|rmb|jpy|aud|cad|zar|ngn|bdt|pkr|lkr|rs|dollars?)\b/gi;
function normalizeAmount(raw: string): string {
  return raw.replace(/,/g, "").replace(/\.0+$/, "");
}
function normalizeCurrency(raw: string): string | null {
  const w = raw.trim().toLowerCase().replace(/\.$/, "");
  return CURRENCY_SYMBOLS[w] ?? CURRENCY_WORDS[w] ?? null;
}
/** Currency-tagged amounts as normalized "amount currency" pairs: "5600 USD",
 * "$5600", "5,600.00 dollars" and "5600usd" all reduce to "5600 usd"; "5600
 * AED" reduces to a different pair, so one currency never grounds another. */
export function currencyAmountPairs(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(CURRENCY_AMOUNT)) {
    const cur = normalizeCurrency(m[1] ?? m[5] ?? "");
    const num = m[3] ?? m[4];
    if (cur && num) out.add(`${normalizeAmount(num)} ${cur}`);
  }
  return out;
}
/** Amounts in a price context without a currency marker ("price is 5600",
 * "5600 per mt") - the bare-price bypass. Grounded by number alone, because
 * that is all the customer gave. */
const PRICE_CONTEXT_AMOUNT = /(?:\bprices?\b[^\d]{0,16}|\brates?\b[^\d]{0,16}|@\s?)(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:[a-z]{3}\s?)?per\s?(?:mt|metric\s?tons?|tons?|tonnes?|kg|kilograms?|lbs?|pounds?|containers?|fcl|pieces?|units?)/gi;
function priceContextAmounts(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(PRICE_CONTEXT_AMOUNT)) {
    const num = m[1] ?? m[2];
    if (num) out.add(normalizeAmount(num));
  }
  return out;
}
/** First amount in the reply the customer never stated in the current product
 * thread, or null when every amount is grounded (or none appears). Currency
 * amounts must match amount AND currency; bare price-context amounts must
 * match a number the customer stated in any price or currency context.
 * Quantities without a price context (5,000 MT) are not price assertions. */
export function ungroundedPriceAssertion(reply: string, scopedUserStatements: string[]): string | null {
  const saidPairs = new Set<string>();
  const saidNumbers = new Set<string>();
  for (const s of scopedUserStatements) {
    for (const p of currencyAmountPairs(s)) { saidPairs.add(p); saidNumbers.add(p.split(" ")[0]); }
    for (const n of priceContextAmounts(s)) saidNumbers.add(n);
  }
  for (const p of currencyAmountPairs(reply)) if (!saidPairs.has(p)) return p;
  for (const n of priceContextAmounts(reply)) if (!saidNumbers.has(n)) return n;
  return null;
}

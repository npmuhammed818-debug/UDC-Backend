import type { SpaDraftInput } from "./spaDraft";

function safe(value: string | null | undefined, fallback: string) {
  return value?.replace(/[\r\n\t]+/g, " ").trim() || fallback;
}

export function createFcoDraft(input: SpaDraftInput) {
  const seller = safe(input.sellerName, "[SELLER LEGAL NAME AND ADDRESS]");
  const buyer = safe(input.buyerName, "[BUYER LEGAL NAME AND ADDRESS]");
  return [
    "FULL CORPORATE OFFER - DISCUSSION DRAFT FOR REVIEW",
    `UDC reference: ${safe(input.dealNumber, "[DEAL REFERENCE]")}`,
    `Date: ${safe(input.date, "[DATE]")}`,
    `From: ${seller}`,
    `To: ${buyer}`,
    "",
    "Proposed sale terms recorded in UDC, subject to seller confirmation and a final signed contract:",
    `Product: ${safe(input.productName, "[PRODUCT AND GRADE]")}`,
    `Quantity: ${safe(input.quantity, "[QUANTITY]")} ${safe(input.unit, "[UNIT]")}`,
    `Indicative unit price recorded in UDC: ${safe(input.currency, "[CURRENCY]")} ${safe(input.agreedPrice, "[PRICE]")} per ${safe(input.unit, "[UNIT]")}`,
    `Delivery: ${safe(input.incoterm, "[INCOTERM]")} ${safe(input.destination, "[NAMED DESTINATION]")}`,
    "Origin, quality specification, shipment schedule, offer validity and document list: [CONFIRM WITH THE SELLER].",
    "Payment framework: DLC issued directly to the seller, with payment after SGS inspection at destination. Exact bank and inspection conditions require review and agreement.",
    "",
    "This is a non-binding discussion draft. It does not prove stock, seller authority, bank acceptance or an obligation to supply. It becomes an offer only after the seller completes, reviews and authorizes it.",
    "Authorized seller representative: [NAME, TITLE AND SIGNATURE AFTER REVIEW]",
    "UDC prepared this draft from recorded deal data and has not independently verified any missing detail. Seek independent legal and banking review before use.",
  ].join("\n");
}

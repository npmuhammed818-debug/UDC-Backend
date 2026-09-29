import type { SpaDraftInput } from "./spaDraft";

function safe(value: string | null | undefined, fallback: string) {
  return value?.replace(/[\r\n\t]+/g, " ").trim() || fallback;
}

export function createLoiDraft(input: SpaDraftInput) {
  const buyer = safe(input.buyerName, "[BUYER LEGAL NAME AND ADDRESS]");
  const seller = safe(input.sellerName, "[SELLER LEGAL NAME AND ADDRESS]");
  return [
    "LETTER OF INTENT - DRAFT FOR REVIEW",
    `UDC reference: ${safe(input.dealNumber, "[DEAL REFERENCE]")}`,
    `Date: ${safe(input.date, "[DATE]")}`,
    `From: ${buyer}`,
    `To: ${seller}`,
    "",
    "We are interested in discussing the following purchase, subject to verification, a final signed contract and bank acceptance:",
    `Product: ${safe(input.productName, "[PRODUCT AND GRADE]")}`,
    `Quantity: ${safe(input.quantity, "[QUANTITY]")} ${safe(input.unit, "[UNIT]")}`,
    `Indicative unit price recorded in UDC: ${safe(input.currency, "[CURRENCY]")} ${safe(input.agreedPrice, "[PRICE]")} per ${safe(input.unit, "[UNIT]")}`,
    `Delivery: ${safe(input.incoterm, "[INCOTERM]")} ${safe(input.destination, "[NAMED DESTINATION]")}`,
    "Origin, quality specification, shipment schedule and document list: [CONFIRM WITH THE PARTIES].",
    "Payment framework: DLC issued directly to the seller, with payment after SGS inspection at destination. Exact bank and inspection conditions require review and agreement.",
    "",
    "This is a non-binding discussion draft. It is not an ICPO, purchase order, bank instrument, guarantee or commitment to buy. No transaction is concluded until authorized parties agree and sign definitive documents.",
    "Authorized buyer representative: [NAME, TITLE AND SIGNATURE AFTER REVIEW]",
    "UDC prepared this draft from recorded deal data and has not independently verified any missing detail. Seek independent legal and banking review before use.",
  ].join("\n");
}

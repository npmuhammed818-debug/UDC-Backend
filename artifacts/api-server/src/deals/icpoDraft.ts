import type { SpaDraftInput } from "./spaDraft";

function safe(value: string | null | undefined, fallback: string) {
  return value?.replace(/[\r\n\t]+/g, " ").trim() || fallback;
}

export function createIcpoDraft(input: SpaDraftInput) {
  return [
    "IRREVOCABLE CORPORATE PURCHASE ORDER - UNISSUED REVIEW COPY",
    `UDC reference: ${safe(input.dealNumber, "[DEAL REFERENCE]")}`,
    `Draft date: ${safe(input.date, "[DATE]")}`,
    `Buyer: ${safe(input.buyerName, "[BUYER LEGAL NAME AND ADDRESS]")}`,
    `Seller: ${safe(input.sellerName, "[SELLER LEGAL NAME AND ADDRESS]")}`,
    "",
    "Proposed purchase details from the UDC deal record for buyer review:",
    `Product: ${safe(input.productName, "[PRODUCT AND GRADE]")}`,
    `Quantity: ${safe(input.quantity, "[QUANTITY]")} ${safe(input.unit, "[UNIT]")}`,
    `Indicative unit price recorded in UDC: ${safe(input.currency, "[CURRENCY]")} ${safe(input.agreedPrice, "[PRICE]")} per ${safe(input.unit, "[UNIT]")}`,
    `Delivery: ${safe(input.incoterm, "[INCOTERM]")} ${safe(input.destination, "[NAMED DESTINATION]")}`,
    "Origin, quality tolerance, shipment schedule, required documents, order validity and authorized buyer details: [COMPLETE AND CONFIRM].",
    "Payment framework: DLC issued directly to the seller, with payment after SGS inspection at destination. Exact bank and inspection conditions require review and agreement.",
    "",
    "UNISSUED REVIEW COPY. This draft is not an issued ICPO or an irrevocable commitment. Only the buyer's authorized representative may finalize and issue a purchase order after reviewing all terms with legal and banking advisers.",
    "Authorized buyer representative: [NAME, TITLE AND SIGNATURE AFTER REVIEW]",
    "UDC prepared this review copy from recorded deal data. UDC has not verified missing terms, the parties or bank acceptance.",
  ].join("\n");
}

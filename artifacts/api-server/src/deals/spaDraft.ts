export type SpaDraftInput = {
  dealNumber: string;
  date: string;
  buyerName?: string | null;
  sellerName?: string | null;
  productName: string;
  quantity: string;
  unit: string;
  agreedPrice: string;
  currency: string;
  incoterm?: string | null;
  destination?: string | null;
};

function safe(value: string | null | undefined, fallback: string) {
  const cleaned = value?.replace(/[\r\n\t]+/g, " ").trim();
  return cleaned || fallback;
}

export function createSpaDraft(input: SpaDraftInput) {
  const buyer = safe(input.buyerName, "[BUYER LEGAL NAME AND REGISTERED ADDRESS — COMPLETE BEFORE SIGNING]");
  const seller = safe(input.sellerName, "[SELLER LEGAL NAME AND REGISTERED ADDRESS — COMPLETE BEFORE SIGNING]");
  const delivery = [input.incoterm, input.destination].filter(Boolean).join(" · ") || "[INCOTERM, NAMED PLACE AND DELIVERY SCHEDULE — AGREE BEFORE SIGNING]";

  return [
    "SALE AND PURCHASE AGREEMENT",
    `DRAFT FOR DISCUSSION ONLY · ${safe(input.dealNumber, "UDC DEAL")}`,
    "NOT AN OFFER, ACCEPTANCE OR EXECUTED CONTRACT. Complete every bracketed item and obtain independent legal review before either party signs.",
    "",
    `Date: ${safe(input.date, "[DATE]")}`,
    `Buyer: ${buyer}`,
    `Seller: ${seller}`,
    "",
    "1. GOODS AND QUANTITY",
    `Product: ${safe(input.productName, "[PRODUCT AND SPECIFICATION]")}`,
    `Quantity: ${safe(input.quantity, "[QUANTITY]")} ${safe(input.unit, "[UNIT]")}`,
    "Quality, grade, origin, packaging, tolerances and acceptance criteria: [COMPLETE AND ATTACH SPECIFICATION].",
    "",
    "2. PRICE AND VALUE",
    `Agreed unit price recorded in UDC: ${safe(input.currency, "[CURRENCY]")} ${safe(input.agreedPrice, "[UNIT PRICE]")} per ${safe(input.unit, "[UNIT]")}.`,
    "Total contract value, price adjustments, taxes, duties and other charges: [CONFIRM AND COMPLETE].",
    "",
    "3. DELIVERY",
    `Delivery term recorded in UDC: ${delivery}.`,
    "Shipment schedule, loading point, destination details, title and risk transfer, insurance and required transport documents: [COMPLETE].",
    "",
    "4. PAYMENT AND INSPECTION FRAMEWORK",
    "The commercial framework recorded for this transaction is a documentary letter of credit (DLC) issued directly to the Seller. The DLC is to be non-transferable, irrevocable, non-divisible and non-assignable. Payment is released after SGS inspection at destination.",
    "The parties must have their banks and independent advisers confirm the complete instrument wording, issuing and advising banks, amount, expiry, presentation requirements, inspection scope, inspector appointment, costs, notice periods and discrepancy process before signing. This draft does not issue or verify any bank instrument or inspection.",
    "",
    "5. DOCUMENTS AND ACCEPTANCE",
    "Required commercial, shipping, origin, quality and inspection documents, delivery deadlines and acceptance procedure: [COMPLETE].",
    "",
    "6. DEFAULT, CLAIMS AND TERMINATION",
    "Applicable remedies, cure periods, claims procedure, force majeure, suspension and termination rights: [TO BE DRAFTED BY THE PARTIES' COUNSEL].",
    "",
    "7. GOVERNING LAW AND DISPUTES",
    "Governing law, dispute forum, seat and language: [AGREE WITH INDEPENDENT LEGAL COUNSEL].",
    "",
    "8. ENTIRE AGREEMENT AND SIGNATURES",
    "This draft becomes binding only when completed, reviewed and signed by authorized representatives of both parties. Any amendments must be made in a written instrument signed by both parties.",
    "",
    "BUYER",
    `Legal entity: ${buyer}`,
    "Authorized representative: [NAME AND TITLE]",
    "Signature: ______________________________    Date: __________________",
    "",
    "SELLER",
    `Legal entity: ${seller}`,
    "Authorized representative: [NAME AND TITLE]",
    "Signature: ______________________________    Date: __________________",
    "",
    "Prepared from UDC deal fields for discussion. UDC has not verified unstored terms and does not provide legal advice. Do not sign until all placeholders are completed and the final text has been independently reviewed.",
  ].join("\n");
}

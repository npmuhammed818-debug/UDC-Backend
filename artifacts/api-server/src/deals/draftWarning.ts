// One shared place for the UDC warning so no draft type can miss it.
// Wording is a draft. The owner chose the "introducing agent" role; a lawyer must confirm all of it before real use.
export const UDC_DRAFT_WARNING_TOP =
  "UDC TEMPLATE - NOT LEGAL ADVICE. UDC acts only as an introducing agent between buyer and seller. Review with your own lawyer before use.";
export const UDC_DRAFT_ROLE_CLAUSE =
  "UDC ROLE: UDC introduced the parties and acts only as an introducing agent. The sale contract is between the Buyer and the Seller. Any agent commission is agreed separately in writing: [LAWYER TO SET]. UDC gives no guarantee of product, funds, quality or delivery.";
export const UDC_DRAFT_WARNING_BOTTOM =
  "WARNING: This is a UDC template only. It is not legal advice. UDC acts only as an introducing agent between the buyer and the seller. The sale contract is between them. UDC does not review, approve or guarantee these terms. [LAWYER TO CONFIRM UDC'S ROLE.] Have your own lawyer review and complete it before you use, share or sign it.";

export function withUdcWarning(body: string) {
  return [UDC_DRAFT_WARNING_TOP, "", body, "", UDC_DRAFT_ROLE_CLAUSE, "", UDC_DRAFT_WARNING_BOTTOM].join("\n");
}

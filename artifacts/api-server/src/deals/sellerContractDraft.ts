import { withUdcWarning } from "./draftWarning.ts";
function line(value: string | null | undefined, fallback: string) {
  return value?.replace(/[\r\n\t]+/g, " ").trim() || fallback;
}

// Seller-only platform contract (owner decision, 28 Oct): this replaces the
// buyer NCNDA. The seller signs UDC's contract; commission terms are the
// owner's to set, every legal term is a lawyer's to set. Nothing here is
// executed, signature-ready or fee-creating until those placeholders are
// replaced and independently reviewed.
export function createSellerContractDraft(input: {
  dealNumber: string; date: string; sellerName?: string | null; buyerName?: string | null;
}) {
  return withUdcWarning([
    "SELLER PLATFORM CONTRACT — DISCUSSION DRAFT",
    `UDC deal reference: ${line(input.dealNumber, "[DEAL REFERENCE]")}`,
    `Prepared: ${line(input.date, "[DATE]")}`,
    "Not executed or signature-ready. All bracketed terms must be completed and independently reviewed by counsel before any use.",
    "",
    "1. Parties and purpose",
    `Seller party: ${line(input.sellerName, "[SELLER LEGAL NAME]")}`,
    `Introduced buyer (for this transaction only): ${line(input.buyerName, "[BUYER LEGAL NAME - REVEALED ONLY AFTER SPA SIGNING AND UDC APPROVAL]")}`,
    "Purpose: the seller appoints UDC as introducing agent for UDC-brought buyers on the terms below. [LAWYER TO SET exact appointment wording.]",
    "",
    "2. Commission on UDC-brought buyers (owner decision, 28 Oct)",
    "The seller pays UDC a commission on every transaction with a buyer UDC introduced, including any later direct transaction with that buyer: rate, calculation basis, currency, triggering event and payment timing [OWNER TO SET]; enforceability, duration and tail period [LAWYER TO SET].",
    "This draft creates no fee until those terms are completed and signed. UDC never states commission mechanics in chat.",
    "",
    "3. Contact confidentiality",
    "Buyer contact details are revealed only after the SPA for the transaction is signed and UDC has approved the reveal. [LAWYER TO SET breach consequences.]",
    "",
    "4. Agents",
    "Any UDC agent involved signs the agent non-circumvention and non-disclosure terms only after the SPA is signed. [LAWYER TO SET the agent terms.]",
    "",
    "5. Seller obligations",
    "Accurate product, price and capacity information; documents verified before any deal; no bypassing UDC with UDC-brought buyers. [LAWYER TO SET remedies and dispute terms.]",
    "",
    "6. Duration, law and disputes",
    "Effective date, term and termination: [LAWYER TO SET]. Applicable law and forum: [LAWYER TO SET].",
    "",
    "7. Authority and execution",
    "Each party verifies legal identity and signatory authority. No sale, supply, payment or banking instrument is authorized by this draft.",
  ].join("\n"));
}

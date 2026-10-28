import { withUdcWarning } from "./draftWarning.ts";
function line(value: string | null | undefined, fallback: string) {
  return value?.replace(/[\r\n\t]+/g, " ").trim() || fallback;
}

// Agent agreement (owner decision, 28 Oct): agents sign their agreement only
// after the SPA for the deal is signed. Commission terms are the owner's to
// set, every legal term is a lawyer's to set. Nothing here is executed,
// signature-ready or fee-creating until those placeholders are replaced and
// independently reviewed.
export function createAgentAgreementDraft(input: {
  dealNumber: string; date: string; agentName?: string | null;
}) {
  return withUdcWarning([
    "AGENT AGREEMENT — DISCUSSION DRAFT",
    `UDC deal reference: ${line(input.dealNumber, "[DEAL REFERENCE]")}`,
    `Prepared: ${line(input.date, "[DATE]")}`,
    "Not executed or signature-ready. All bracketed terms must be completed and independently reviewed by counsel before any use.",
    "",
    "1. Parties and purpose",
    `Agent party: ${line(input.agentName, "[AGENT FULL NAME]")}`,
    "Purpose: records the agent's introduction role for this transaction and the non-circumvention and confidentiality duties that follow it. [LAWYER TO SET exact wording.]",
    "",
    "2. Timing (owner decision, 28 Oct)",
    "This agreement is signed only after the sale and purchase agreement (SPA) for this deal is signed. It creates no obligation before that signature.",
    "",
    "3. Commission (placeholders only)",
    "Any agent commission for this deal: rate, basis, currency, triggering event and payment timing [OWNER TO SET]; enforceability and duration [LAWYER TO SET].",
    "This draft creates no fee until those terms are completed and signed. UDC never states commission mechanics in chat.",
    "",
    "4. Confidentiality and non-circumvention",
    "The agent keeps deal terms and party details confidential and does not bypass UDC in this transaction. [LAWYER TO SET scope, duration and remedies.]",
    "",
    "5. Role of UDC",
    "UDC introduces the parties only and gives no guarantee of product, funds, quality or delivery.",
    "",
    "Signatures: [AGENT]  ·  [FOR UDC]",
  ].join("\n"));
}

function line(value: string | null | undefined, fallback: string) {
  return value?.replace(/[\r\n\t]+/g, " ").trim() || fallback;
}

export function createNcndaDraft(input: {
  dealNumber: string; date: string; buyerName?: string | null; sellerName?: string | null;
}) {
  return [
    "NON-CIRCUMVENTION AND NON-DISCLOSURE — DISCUSSION DRAFT",
    `UDC deal reference: ${line(input.dealNumber, "[DEAL REFERENCE]")}`,
    `Prepared: ${line(input.date, "[DATE]")}`,
    "Not executed or signature-ready. Complete all bracketed terms and obtain independent legal review.",
    "",
    "1. Parties and purpose",
    `Proposed buyer party: ${line(input.buyerName, "[BUYER LEGAL NAME]")}`,
    `Proposed seller party: ${line(input.sellerName, "[SELLER LEGAL NAME]")}`,
    "Additional introducers/agents and contracting legal entities: [LIST EACH AGREED PARTY, ADDRESS AND AUTHORIZED REPRESENTATIVE].",
    "Purpose: evaluate and coordinate only the transaction identified above. This draft does not assume UDC is an incorporated contracting party.",
    "",
    "2. Confidential information",
    "Proposed scope: non-public commercial terms, introductions and documents expressly identified as confidential for this transaction. Specify permitted recipients and required safeguards: [AGREE].",
    "Exclude information already lawfully known, public without breach, independently developed, or lawfully received without confidentiality restriction. Required legal/regulatory disclosure remains subject to applicable law.",
    "",
    "3. Introductions and non-circumvention",
    "Identify protected introductions in a dated schedule accepted by all affected parties: [INTRODUCTION, INTRODUCER, DATE, TRANSACTION SCOPE].",
    "Define any agreed restriction on knowingly bypassing those introductions, its exceptions, duration and geographic scope: [AGREE AFTER LEGAL REVIEW]. Do not treat an introduction alone as a perpetual restriction or ownership of a customer.",
    "",
    "4. Commissions",
    "Any commission must be separately agreed in writing, identifying payer, recipient, calculation, currency, triggering completed transaction and payment timing: [AGREE]. This draft creates no automatic fee or payment authority.",
    "",
    "5. Duration, remedies and disputes",
    "Effective date, confidentiality duration and termination: [AGREE].",
    "Applicable law, courts/arbitration, service of notices and any lawful remedies: [AGREE WITH COUNSEL]. No penalty, damages amount or jurisdiction is assumed.",
    "",
    "6. Authority and execution",
    "Each party must verify legal identity and signatory authority. Changes and signatures: [COMPLETE AFTER REVIEW].",
    "No sale, supply, banking instrument, inspection booking, verification approval or transfer of funds is authorized by this draft.",
  ].join("\n");
}

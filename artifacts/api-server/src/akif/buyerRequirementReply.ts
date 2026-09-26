import type { BuyerRequirementDraft } from "./buyerRequirementTriage";

const labels: Record<BuyerRequirementDraft["missingFields"][number], string> = {
  product: "product and specification",
  quantity: "quantity in MT",
  destination: "destination port or location",
};

export function buyerRequirementReply(draft: BuyerRequirementDraft) {
  if (draft.missingFields.length === 0) {
    return "Thanks. UDC recorded your requirement and a trade administrator will review it before any seller contact.";
  }
  const requested = draft.missingFields.map((field) => labels[field]).join(", ");
  return `Thanks. To prepare your requirement, please share: ${requested}.`;
};

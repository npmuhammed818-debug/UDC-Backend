import type { BuyerRequirementDraft } from "./buyerRequirementTriage";

const labels: Record<BuyerRequirementDraft["missingFields"][number], string> = {
  product: "product and specification",
  quantity: "quantity in MT",
  destination: "destination port or location",
};

export function buyerRequirementReply(draft: BuyerRequirementDraft) {
  if (draft.missingFields.length === 0) {
    return "Got it. I’ve got the requirement. I’ll take it from here and come back once it’s ready to move.";
  }
  const requested = draft.missingFields.map((field) => labels[field]).join(", ");
  return `Got it. I just need ${requested}.`;
};

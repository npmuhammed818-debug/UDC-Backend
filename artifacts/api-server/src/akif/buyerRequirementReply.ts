import type { BuyerRequirementDraft } from "./buyerRequirementTriage";

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function buyerRequirementReply(draft: BuyerRequirementDraft) {
  const next = draft.missingFields[0];

  if (!next) {
    const price = draft.targetPrice ? ` at $${formatPrice(draft.targetPrice)}/${draft.unit ?? "MT"}` : "";
    return `Perfect. ${draft.quantity} ${draft.unit ?? "MT"} ${draft.product} to ${draft.destination}${price}. I’ll take it from here.`;
  }

  if (next === "product") return "What are you looking for?";
  if (next === "quantity") return "How much do you need?";
  if (next === "targetPrice") return "What price are you targeting?";
  return "Where do you need it delivered?";
}

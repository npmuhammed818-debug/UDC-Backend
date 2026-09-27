import type { SellerOfferDraft } from "./sellerOfferTriage";

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function sellerOfferReply(draft: SellerOfferDraft) {
  const next = draft.missingFields[0];

  if (!next) {
    return `Perfect. ${draft.quantity} ${draft.unit ?? "MT"} ${draft.product} at $${formatPrice(draft.price!)}/${draft.unit ?? "MT"}. I’ll take it from here.`;
  }

  if (next === "product") return "What are you offering?";
  if (next === "quantity") return "How much can you supply?";
  return "What’s your best price?";
}

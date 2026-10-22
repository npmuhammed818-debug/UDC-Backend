import type { SellerOfferDraft } from "./sellerOfferTriage";

export function sellerOfferReply(draft: SellerOfferDraft) {
  const next = draft.missingFields[0];

  if (!next) return "Thanks, I’ve sent this offer to UDC for review. Would you like to add another product?";

  if (next === "product") return "What product are you offering?";
  if (next === "quantity") return "What quantity can you supply?";
  return "What price are you offering, and what currency and unit is it for?";
}

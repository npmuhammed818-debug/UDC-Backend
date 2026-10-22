import type { SellerOfferDraft } from "./sellerOfferTriage";

export function sellerOfferReply(draft: SellerOfferDraft) {
  const next = draft.missingFields[0];

  if (!next) return "Thanks, I have the key offer details. I’ll send them to UDC for review.";

  if (next === "product") return "What product are you offering?";
  if (next === "quantity") return "What quantity can you supply?";
  return "What price are you offering, and what currency and unit is it for?";
}

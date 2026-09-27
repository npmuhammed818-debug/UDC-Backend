import type { SellerOfferDraft } from "./sellerOfferTriage";

const labels: Record<SellerOfferDraft["missingFields"][number], string> = {
  product: "product and specification",
  quantity: "available quantity in MT",
  price: "offer price per MT in USD",
};

export function sellerOfferReply(draft: SellerOfferDraft) {
  if (draft.missingFields.length === 0) {
    return "Got it. I’ve got the offer. I’ll take it from here and come back once it’s ready to move.";
  }
  return `Got it. I just need ${draft.missingFields.map((field) => labels[field]).join(", ")}.`;
}

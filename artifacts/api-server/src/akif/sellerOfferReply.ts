import type { SellerOfferDraft } from "./sellerOfferTriage";

const labels: Record<SellerOfferDraft["missingFields"][number], string> = {
  product: "product and specification",
  quantity: "available quantity in MT",
  price: "offer price per MT in USD",
};

export function sellerOfferReply(draft: SellerOfferDraft) {
  if (draft.missingFields.length === 0) {
    return "Thanks. UDC recorded your offer for administrator review before it is considered for matching.";
  }
  return `Thanks. To record your offer, please share: ${draft.missingFields.map((field) => labels[field]).join(", ")}.`;
}

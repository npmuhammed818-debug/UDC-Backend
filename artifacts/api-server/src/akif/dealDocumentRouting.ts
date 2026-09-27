export type DealDocumentDeliveryTarget = "sender" | "counterparty";

export function requestedDealDocumentDeliveryTarget(
  text: string,
  senderRole: string,
): DealDocumentDeliveryTarget {
  const normalized = text.trim().toLowerCase();

  if (/(?:to|for)s+me|here/.test(normalized)) {
    return "sender";
  }

  if (
    /(?:to|for)s+(?:him|her|them|the other side|other side|the other party|other party|counterparty)/.test(normalized)
  ) {
    return "counterparty";
  }

  const targetsBuyer =
    /(?:to|for)s+(?:thes+)?buyer/.test(normalized)
    || /(?:send|share|forward|give).*(?:thes+)?buyer/.test(normalized);

  if (targetsBuyer) {
    return senderRole === "buyer" ? "sender" : "counterparty";
  }

  const targetsSeller =
    /(?:to|for)s+(?:thes+)?seller/.test(normalized)
    || /(?:send|share|forward|give).*(?:thes+)?seller/.test(normalized);

  if (targetsSeller) {
    return senderRole === "seller" ? "sender" : "counterparty";
  }

  return "sender";
}

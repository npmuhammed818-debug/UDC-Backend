export type DealDocumentDeliveryTarget = "sender" | "counterparty";

export function requestedDealDocumentDeliveryTarget(
  text: string,
  senderRole: string,
): DealDocumentDeliveryTarget {
  const normalized = text.trim().toLowerCase();

  if (/\b(?:to|for)\s+me\b|\bhere\b/.test(normalized)) {
    return "sender";
  }

  if (
    /\b(?:to|for|with)\s+(?:him|her|them|the other side|other side|the other party|other party|counterparty)\b/.test(normalized)
  ) {
    return "counterparty";
  }

  const targetsBuyer =
    /\b(?:to|for)\s+(?:the\s+)?buyer\b/.test(normalized)
    || /\b(?:send|share|forward|give)\b.*\b(?:the\s+)?buyer\b/.test(normalized);

  if (targetsBuyer) {
    return senderRole === "buyer" ? "sender" : "counterparty";
  }

  const targetsSeller =
    /\b(?:to|for)\s+(?:the\s+)?seller\b/.test(normalized)
    || /\b(?:send|share|forward|give)\b.*\b(?:the\s+)?seller\b/.test(normalized);

  if (targetsSeller) {
    return senderRole === "seller" ? "sender" : "counterparty";
  }

  return "sender";
}

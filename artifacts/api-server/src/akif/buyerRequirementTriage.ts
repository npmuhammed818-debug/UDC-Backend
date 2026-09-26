export type BuyerRequirementDraft = {
  product?: string;
  quantity?: number;
  unit?: string;
  destination?: string;
  targetPrice?: number;
  currency?: string;
  incoterm?: string;
  missingFields: Array<"product" | "quantity" | "destination">;
};

const incoterms = ["CIF", "FOB", "CFR", "EXW", "DAP", "DDP"];

export function triageBuyerRequirement(text: string): BuyerRequirementDraft {
  const normalized = text.trim();
  const quantityMatch = normalized.match(/\b([\d,.]+)\s*(MT|metric tons?|tonnes?)\b/i);
  const priceMatch = normalized.match(/(?:USD|\$)\s*([\d,.]+)(?:\s*\/?\s*(?:MT|tonne))?/i);
  const destinationMatch = normalized.match(/\b(?:to|for|delivered to|destination)\s+([A-Za-z][A-Za-z .\'-]{1,80})/i);
  const product = /\bcopper(?:\s+(?:scrap|millberry|cathode|wire))?\b/i.exec(normalized)?.[0];
  const incoterm = incoterms.find((value) => new RegExp(`\\b${value}\\b`, "i").test(normalized));

  const draft: BuyerRequirementDraft = {
    ...(product ? { product } : {}),
    ...(quantityMatch
      ? { quantity: Number(quantityMatch[1].replaceAll(",", "")), unit: "MT" }
      : {}),
    ...(destinationMatch ? { destination: destinationMatch[1].trim() } : {}),
    ...(priceMatch
      ? { targetPrice: Number(priceMatch[1].replaceAll(",", "")), currency: "USD" }
      : {}),
    ...(incoterm ? { incoterm } : {}),
    missingFields: [],
  };

  draft.missingFields = [
    ...(draft.product ? [] : ["product" as const]),
    ...(draft.quantity ? [] : ["quantity" as const]),
    ...(draft.destination ? [] : ["destination" as const]),
  ];
  return draft;
};

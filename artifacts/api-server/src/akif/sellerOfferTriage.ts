export type SellerOfferDraft = {
  product?: string;
  quantity?: number;
  unit?: string;
  price?: number;
  currency?: string;
  originCountry?: string;
  destination?: string;
  incoterm?: string;
  missingFields: Array<"product" | "quantity" | "price">;
};

const incoterms = ["CIF", "FOB", "CFR", "EXW", "DAP", "DDP"];

export function isSellerOffer(text: string) {
  return /^\s*(?:sell|selling|offer|offering|supply|supplying)\b/i.test(text);
}

export function triageSellerOffer(text: string): SellerOfferDraft {
  const normalized = text.trim();
  const quantityMatch = normalized.match(/\b([\d,.]+)\s*(MT|metric tons?|tonnes?)\b/i);
  const priceMatch = normalized.match(/(?:USD|\$)\s*([\d,.]+)(?:\s*\/?\s*(?:MT|tonne))?/i);
  const originMatch = normalized.match(/\b(?:from|origin)\s+([A-Za-z][A-Za-z .'-]{1,80})/i);
  const destinationMatch = normalized.match(/\b(?:to|for|destination)\s+([A-Za-z][A-Za-z .'-]{1,80})/i);
  const product = /\bcopper(?:\s+(?:scrap|millberry|cathode|wire))?\b/i.exec(normalized)?.[0];
  const incoterm = incoterms.find((value) => new RegExp(`\\b${value}\\b`, "i").test(normalized));

  const draft: SellerOfferDraft = {
    ...(product ? { product } : {}),
    ...(quantityMatch ? { quantity: Number(quantityMatch[1].replaceAll(",", "")), unit: "MT" } : {}),
    ...(priceMatch ? { price: Number(priceMatch[1].replaceAll(",", "")), currency: "USD" } : {}),
    ...(originMatch ? { originCountry: originMatch[1].trim() } : {}),
    ...(destinationMatch ? { destination: destinationMatch[1].trim() } : {}),
    ...(incoterm ? { incoterm } : {}),
    missingFields: [],
  };

  draft.missingFields = [
    ...(draft.product ? [] : ["product" as const]),
    ...(draft.quantity ? [] : ["quantity" as const]),
    ...(draft.price ? [] : ["price" as const]),
  ];
  return draft;
}

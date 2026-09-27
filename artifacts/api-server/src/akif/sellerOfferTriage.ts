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
  const normalized = text.trim();

  return [
    /^(?:sell|selling|offer|offering|supply|supplying)\b/i,
    /^(?:i|we)\s+(?:can|will|want to|would like to|am able to|are able to)\s+(?:sell|offer|supply)\b/i,
    /^(?:i|we)\s+(?:am|are)\s+(?:selling|offering|supplying)\b/i,
    /\b(?:seller offer|available for sale|we have available|i have available)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

export function triageSellerOffer(text: string): SellerOfferDraft {
  const normalized = text.trim();
  const quantityMatch = normalized.match(/\b([\d,.]+)\s*(MT|metric tons?|tonnes?)\b/i);
  const priceMatch =
    normalized.match(/(?:USD|\$)\s*([\d,.]+)(?:\s*\/?\s*(?:MT|tonne))?/i) ??
    normalized.match(/\b([\d,.]+)\s*USD(?:\s*(?:per|\/)\s*(?:MT|metric ton|tonne))?/i);
  const originMatch = normalized.match(
    /\b(?:from|origin(?:\s+country)?(?:\s+is)?)\s+([A-Za-z][A-Za-z .'-]{1,80}?)(?=\s+(?:to|destination|for|at|@|CIF|FOB|CFR|EXW|DAP|DDP)\b|$)/i,
  );
  const destinationMatch = normalized.match(
    /\b(?:to|destination(?:\s+is)?)\s+([A-Za-z][A-Za-z .'-]{1,80}?)(?=\s+(?:at|@|CIF|FOB|CFR|EXW|DAP|DDP)\b|$)/i,
  );
  const specificProduct = /\b(?:copper(?:\s+(?:scrap|millberry|cathode|wire))?|millberry(?:\s+copper)?|copper wire scrap)\b/i.exec(normalized)?.[0];
  const productBeforeQuantity = normalized.match(
    /\b(?:sell|selling|offer|offering|supply|supplying)\s+([A-Za-z][A-Za-z0-9 .'-]{1,80}?)\s+(?=[\d,.]+\s*(?:MT|metric tons?|tonnes?))/i,
  )?.[1]?.trim();
  const productAfterQuantity = normalized.match(
    /\b[\d,.]+\s*(?:MT|metric tons?|tonnes?)\s+([A-Za-z][A-Za-z0-9 .'-]{1,80}?)(?=\s+(?:from|to|for|at|@|CIF|FOB|CFR|EXW|DAP|DDP|USD|\$)\b|[,.;]|$)/i,
  )?.[1]?.trim();
  const productCandidate = specificProduct ?? productBeforeQuantity ?? productAfterQuantity;
  const product = productCandidate
    ? /^millberry/i.test(productCandidate)
      ? "Copper Millberry"
      : productCandidate
    : undefined;
  const incoterm = incoterms.find((value) => new RegExp(`\\b${value}\\b`, "i").test(normalized));

  const draft: SellerOfferDraft = {
    ...(product ? { product } : {}),
    ...(quantityMatch ? { quantity: Number(quantityMatch[1].replaceAll(",", "")), unit: "MT" } : {}),
    ...(priceMatch
      ? {
          price: Number((priceMatch[1] ?? priceMatch[2]).replaceAll(",", "")),
          currency: "USD",
        }
      : {}),
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

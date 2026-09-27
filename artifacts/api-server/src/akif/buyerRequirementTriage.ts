export type BuyerRequirementDraft = {
  product?: string;
  quantity?: number;
  unit?: string;
  destination?: string;
  targetPrice?: number;
  currency?: string;
  incoterm?: string;
  missingFields: Array<"product" | "quantity" | "targetPrice" | "destination">;
};

const incoterms = ["CIF", "FOB", "CFR", "EXW", "DAP", "DDP"];

export function triageBuyerRequirement(text: string): BuyerRequirementDraft {
  const normalized = text.trim();
  const quantityMatch = normalized.match(/\b([\d,.]+)\s*(MT|metric tons?|tonnes?)\b/i);
  const priceMatch =
    normalized.match(/(?:USD|\$)\s*([\d,.]+)(?:\s*\/?\s*(?:MT|tonne))?/i)
    ?? normalized.match(/\b([\d,.]+)\s*USD(?:\s*(?:per|\/)\s*(?:MT|metric ton|tonne))?/i);
  // Buyers commonly state the destination directly after a destination-side
  // Incoterm (for example, "CIF Jebel Ali") rather than using "to".
  const destinationMatch = normalized.match(
    /\b(?:to|for|delivered to|destination(?:\s+is)?|CIF|DAP|DDP)\s+([A-Za-z][A-Za-z .'-]{1,80}?)(?=\s*(?:,|;|\.|(?:maximum|max|target|at|USD|\$)\b)|$)/i,
  );
  const productMatch = /\b(?:copper(?:\s+(?:scrap|millberry|cathode|wire))?|millberry(?:\s+copper)?|copper wire scrap)\b/i.exec(normalized)?.[0];
  const product = productMatch
    ? /^millberry/i.test(productMatch)
      ? "Copper Millberry"
      : productMatch
    : undefined;
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
    ...(draft.targetPrice ? [] : ["targetPrice" as const]),
    ...(draft.destination ? [] : ["destination" as const]),
  ];
  return draft;
};

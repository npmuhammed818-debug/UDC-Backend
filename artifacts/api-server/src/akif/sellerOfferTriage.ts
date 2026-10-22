export type SellerOfferDraft = {
  product?: string;
  specification?: string;
  paymentTerms?: string;
  availability?: string;
  inspectionTerms?: string;
  monthlyCapacity?: number;
  minimumOrderQuantity?: number;
  quantity?: number;
  unit?: string;
  price?: number;
  currency?: string;
  originCountry?: string;
  destination?: string;
  incoterm?: string;
  missingFields: Array<"product" | "quantity" | "price">;
};

const incoterms = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const currencies: Record<string, string> = { USD: "USD", "US$": "USD", "$": "USD", AED: "AED", EUR: "EUR", "€": "EUR", GBP: "GBP", "£": "GBP", INR: "INR", "₹": "INR", CNY: "CNY", RMB: "CNY", SAR: "SAR", OMR: "OMR" };

function parseMoney(text: string) {
  const amount = String.raw`([\d,]+(?:\.\d+)?)\s*([kKmM])?`;
  const currency = String.raw`(USD|US\$|AED|EUR|GBP|INR|CNY|RMB|SAR|OMR|\$|€|£|₹)`;
  const priceUnit = String.raw`(?:\s*(?:per\s+|/\s*)(MT|metric\s+tons?|tonnes?|tons?|kg|kilograms?|g|grams?|pieces?|pcs|cartons?|boxes?|containers?))?`;
  const patterns = [
    new RegExp(`${currency}\\s*${amount}${priceUnit}`, "i"),
    new RegExp(`${amount}\\s*${currency}${priceUnit}`, "i"),
  ];

  for (let index = 0; index < patterns.length; index += 1) {
    const match = patterns[index].exec(text);
    if (!match) continue;
    const currencyCode = (index === 0 ? match[1] : match[3]).toUpperCase();
    const rawAmount = index === 0 ? match[2] : match[1];
    const scale = (index === 0 ? match[3] : match[2])?.toLowerCase();
    const rawUnit = (index === 0 ? match[4] : match[4])?.toLowerCase();
    const multiplier = scale === "k" ? 1_000 : scale === "m" ? 1_000_000 : 1;
    const normalizedUnit = rawUnit
      ? /^(?:mt|metric\s+tons?|tonnes?|tons?)$/.test(rawUnit) ? "MT"
        : /^(?:kg|kilograms?)$/.test(rawUnit) ? "kg"
          : /^(?:g|grams?)$/.test(rawUnit) ? "g"
            : /^(?:pieces?|pcs)$/.test(rawUnit) ? "piece"
              : /^(?:cartons?|boxes?)$/.test(rawUnit) ? "carton" : "container"
      : undefined;

    return {
      price: Number(rawAmount.replaceAll(",", "")) * multiplier,
      currency: currencies[currencyCode] ?? currencyCode,
      ...(normalizedUnit ? { unit: normalizedUnit } : {}),
    };
  }
  return null;
}

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
  const price = parseMoney(normalized);
  const originMatch = normalized.match(
    /\b(?:from|origin(?:\s+country)?(?:\s+is)?)\s+([A-Za-z][A-Za-z .'-]{1,80}?)(?=\s+(?:to|destination|for|at|@|CIF|FOB|CFR|EXW|DAP|DDP)\b|[,;\n]|$)/i,
  );
  const destinationMatch = normalized.match(
    /\b(?:to|destination(?:\s+is)?|(?:CFR|CIF|CPT|CIP|DAP|DPU|DDP))\s+([A-Za-z][A-Za-z .'-]{1,80}?)(?=\s+(?:at|@|CIF|FOB|CFR|EXW|DAP|DDP|USD|AED|EUR|GBP|INR|\$)\b|[,;\n]|$)/i,
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
    ? /^(?:millberry(?:\s+copper)?|copper\s+millberry)/i.test(productCandidate)
      ? "Copper Millberry"
      : productCandidate
    : undefined;
  const incoterm = incoterms.find((value) => new RegExp(`\\b${value}\\b`, "i").test(normalized));
  const specificationMatch = normalized.match(/\b(?:purity|grade|specification|spec)\s*[:=-]?\s*([^,;\n]+)/i);

  const draft: SellerOfferDraft = {
    ...(product ? { product } : {}),
    ...(quantityMatch ? { quantity: Number(quantityMatch[1].replaceAll(",", "")), unit: "MT" } : {}),
    ...(price ? { price: price.price, currency: price.currency, ...(price.unit ? { unit: price.unit } : {}) } : {}),
    ...(originMatch ? { originCountry: originMatch[1].trim() } : {}),
    ...(destinationMatch ? { destination: destinationMatch[1].trim() } : {}),
    ...(specificationMatch ? { specification: specificationMatch[1].trim().replace(/[.!?]+$/, "") } : {}),
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

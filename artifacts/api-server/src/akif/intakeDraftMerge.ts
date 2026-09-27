import type { BuyerRequirementDraft } from "./buyerRequirementTriage";
import type { SellerOfferDraft } from "./sellerOfferTriage";

function cleanDestinationHint(text: string) {
  const cleaned = text
    .trim()
    .replace(/(?:i|we)s+(?:already|alrdy|alreadys+did|said).*$/i, "")
    .replace(/(?:right|rite)s*??$/i, "")
    .replace(/[!?.,]+$/g, "")
    .trim();

  if (!cleaned || /d|$|(?:usd|aed|inr|eur|dlc|sgs|fco|spa|loi|icpo|yes|no|ok|okay)/i.test(cleaned)) {
    return undefined;
  }

  const words = cleaned.split(/s+/);
  if (words.length > 5 || cleaned.length > 80) return undefined;
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(cleaned)) return undefined;
  return cleaned;
}

function buyerMissing(draft: Omit<BuyerRequirementDraft, "missingFields">) {
  return [
    ...(draft.product ? [] : ["product" as const]),
    ...(draft.quantity ? [] : ["quantity" as const]),
    ...(draft.targetPrice ? [] : ["targetPrice" as const]),
    ...(draft.destination ? [] : ["destination" as const]),
  ];
}

function sellerMissing(draft: Omit<SellerOfferDraft, "missingFields">) {
  return [
    ...(draft.product ? [] : ["product" as const]),
    ...(draft.quantity ? [] : ["quantity" as const]),
    ...(draft.price ? [] : ["price" as const]),
  ];
}

export function mergeBuyerRequirementDraft(
  previous: Partial<BuyerRequirementDraft> | null,
  current: BuyerRequirementDraft,
  incomingText: string,
): BuyerRequirementDraft {
  const merged = {
    product: current.product ?? previous?.product,
    quantity: current.quantity ?? previous?.quantity,
    unit: current.unit ?? previous?.unit,
    destination: current.destination ?? previous?.destination,
    targetPrice: current.targetPrice ?? previous?.targetPrice,
    currency: current.currency ?? previous?.currency,
    incoterm: current.incoterm ?? previous?.incoterm,
  };

  const currentHasTradeFact = Boolean(
    current.product
      || current.quantity
      || current.targetPrice
      || current.destination
      || current.incoterm,
  );

  if (!merged.destination && !currentHasTradeFact && previous) {
    merged.destination = cleanDestinationHint(incomingText);
  }

  return {
    ...merged,
    missingFields: buyerMissing(merged),
  };
}

export function mergeSellerOfferDraft(
  previous: Partial<SellerOfferDraft> | null,
  current: SellerOfferDraft,
): SellerOfferDraft {
  const merged = {
    product: current.product ?? previous?.product,
    quantity: current.quantity ?? previous?.quantity,
    unit: current.unit ?? previous?.unit,
    price: current.price ?? previous?.price,
    currency: current.currency ?? previous?.currency,
    originCountry: current.originCountry ?? previous?.originCountry,
    destination: current.destination ?? previous?.destination,
    incoterm: current.incoterm ?? previous?.incoterm,
  };

  return {
    ...merged,
    missingFields: sellerMissing(merged),
  };
}

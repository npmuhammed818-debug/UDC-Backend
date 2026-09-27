export type DealFacts = {
  status: string;
  quantity: string;
  unit: string;
  agreedPrice: string;
  currency: string;
  incoterm: string | null;
  destination: string | null;
};

export function directDealFactReply(text: string, deal: DealFacts) {
  const normalized = text.trim().toLowerCase();

  const asksStatus =
    /^(?:what|wht|whats|what's|where|whr|tell me|give me)?\s*(?:is|are)?\s*(?:the\s*)?(?:current\s*)?(?:deal\s*)?(?:status|stage|update)\??$/i.test(normalized)
    || /\b(?:current deal status|deal status|deal stage|where are we with (?:this|the) deal|where is (?:this|the) deal)\b/.test(normalized);

  if (asksStatus) {
    return `The deal is currently in ${deal.status}. Confirmed terms in UDC are ${deal.quantity} ${deal.unit} at ${deal.currency} ${deal.agreedPrice}/${deal.unit}${deal.incoterm ? `, ${deal.incoterm}` : ""}${deal.destination ? ` to ${deal.destination}` : ""}.`;
  }

  const asksConfirmedPrice =
    /^(?:what|wht|whats|what's|tell me)?\s*(?:is|are)?\s*(?:the\s*)?(?:current|confirmed|agreed)?\s*(?:deal\s*)?(?:price|rate)\??$/i.test(normalized)
    || /\b(?:current|confirmed|agreed)\s+(?:deal\s+)?(?:price|rate)\b/.test(normalized);

  if (asksConfirmedPrice) {
    return `The confirmed price in UDC is ${deal.currency} ${deal.agreedPrice} per ${deal.unit}.`;
  }

  const asksConfirmedQuantity =
    /^(?:what|wht|whats|what's|tell me)?\s*(?:is|are)?\s*(?:the\s*)?(?:current|confirmed|agreed)?\s*(?:deal\s*)?(?:quantity|qty|volume)\??$/i.test(normalized)
    || /\b(?:current|confirmed|agreed)\s+(?:deal\s+)?(?:quantity|qty|volume)\b/.test(normalized);

  if (asksConfirmedQuantity) {
    return `The confirmed quantity in UDC is ${deal.quantity} ${deal.unit}.`;
  }

  const asksDestination =
    /^(?:what|wht|where|whr|which|tell me).*\b(?:current|confirmed|agreed)?\s*(?:destination|delivery place|delivery port|port)\b.*\??$/i.test(normalized)
    && !/\b(?:can|could|will|would)\b/.test(normalized);

  if (asksDestination) {
    return deal.destination
      ? `The confirmed destination in UDC is ${deal.destination}.`
      : "UDC does not have a confirmed destination recorded for this deal yet.";
  }

  const asksIncoterm =
    /^(?:what|wht|which|tell me).*\b(?:current|confirmed|agreed)?\s*(?:incoterm|cif|fob|cfr|exw)\b.*\??$/i.test(normalized)
    && !/\b(?:can|could|will|would)\b/.test(normalized);

  if (asksIncoterm) {
    return deal.incoterm
      ? `The confirmed Incoterm in UDC is ${deal.incoterm}.`
      : "UDC does not have a confirmed Incoterm recorded for this deal yet.";
  }

  return null;
}

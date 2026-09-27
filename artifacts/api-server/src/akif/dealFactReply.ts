export type DealFacts = {
  status: string;
  quantity: string;
  unit: string;
  agreedPrice: string;
  currency: string;
  incoterm: string | null;
  destination: string | null;
};

function formatTradeNumber(value: string | number, max = 6) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
    useGrouping: true,
  }).format(numeric);
}

function formatTradeQuantity(value: string | number) {
  return formatTradeNumber(value, 6);
}

function formatTradeMoney(currency: string, value: string | number) {
  const amount = formatTradeNumber(value, 2);
  const code = currency.trim().toUpperCase();
  return code === "USD" ? `$${amount}` : `${code} ${amount}`;
}

export function directDealFactReply(text: string, deal: DealFacts) {
  const normalized = text.trim().toLowerCase();

  const asksStatus =
    /^(?:what|wht|whats|what's|where|whr|tell me|give me)?\s*(?:is|are)?\s*(?:the\s*)?(?:current\s*)?(?:deal\s*)?(?:status|stage|update)\??$/i.test(normalized)
    || /\b(?:current deal status|deal status|deal stage|where are we with (?:this|the) deal|where is (?:this|the) deal)\b/.test(normalized);

  if (asksStatus) {
    return `We’re in ${deal.status}. Right now it’s ${formatTradeQuantity(deal.quantity)} ${deal.unit} at ${formatTradeMoney(deal.currency, deal.agreedPrice)}/${deal.unit}${deal.incoterm ? `, ${deal.incoterm}` : ""}${deal.destination ? ` to ${deal.destination}` : ""}.`;
  }

  const asksConfirmedPrice =
    /^(?:what|wht|whats|what's|tell me)?\s*(?:is|are)?\s*(?:the\s*)?(?:current|confirmed|agreed)?\s*(?:deal\s*)?(?:price|rate)\??$/i.test(normalized)
    || /\b(?:current|confirmed|agreed)\s+(?:deal\s+)?(?:price|rate)\b/.test(normalized);

  if (asksConfirmedPrice) {
    return `${formatTradeMoney(deal.currency, deal.agreedPrice)}/${deal.unit} right now.`;
  }

  const asksConfirmedQuantity =
    /^(?:what|wht|whats|what's|tell me)?\s*(?:is|are)?\s*(?:the\s*)?(?:current|confirmed|agreed)?\s*(?:deal\s*)?(?:quantity|qty|volume)\??$/i.test(normalized)
    || /\b(?:current|confirmed|agreed)\s+(?:deal\s+)?(?:quantity|qty|volume)\b/.test(normalized);

  if (asksConfirmedQuantity) {
    return `${formatTradeQuantity(deal.quantity)} ${deal.unit} right now.`;
  }

  const asksDestination =
    /^(?:what|wht|where|whr|which|tell me).*\b(?:current|confirmed|agreed)?\s*(?:destination|delivery place|delivery port|port)\b.*\??$/i.test(normalized)
    && !/\b(?:can|could|will|would)\b/.test(normalized);

  if (asksDestination) {
    return deal.destination
      ? `${deal.destination}.`
      : "Destination isn’t confirmed yet.";
  }

  const asksIncoterm =
    (
      /\b(?:current|confirmed|agreed)\s+(?:deal\s+)?incoterm\b/i.test(normalized)
      || /^(?:what|wht|which|tell me).*\b(?:the\s+)?incoterm\b.*\??$/i.test(normalized)
    )
    && !/\b(?:can|could|will|would)\b/.test(normalized);

  if (asksIncoterm) {
    return deal.incoterm
      ? `${deal.incoterm}.`
      : "Incoterm isn’t confirmed yet.";
  }

  return null;
}

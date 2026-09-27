export type DealConversationDecision = {
  intent: string;
  replyToSender: string;
  relay: boolean;
  relayToCounterparty: string | null;
  newTradeIntake: boolean;
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

export type DealStateForReply = {
  status: string;
  quantity: string;
  unit: string;
  agreedPrice: string;
  currency: string;
};

const allowedIntents = new Set([
  "acceptance",
  "rejection",
  "counteroffer",
  "document_request",
  "document_submission",
  "meeting_request",
  "counterparty_question",
  "deal_question",
  "status_question",
  "casual",
  "clarification",
  "new_trade_intake",
  "other",
]);

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return unfenced.slice(start, end + 1);
}

function looksStructured(raw: string) {
  const value = raw.trim().toLowerCase();
  return value.startsWith("{")
    || value.startsWith("```json")
    || value.includes('"replytosender"')
    || value.includes('"relaytocounterparty"')
    || value.includes('"newtradeintake"');
}

function looksLikeProviderDiagnostic(text: string) {
  const value = text.toLowerCase();
  const knownDiagnostic = [
    "api key",
    "insufficient_quota",
    "billing",
    "rate limit",
    "rate_limit",
    "no llm provider",
    "provider unavailable",
    "model unavailable",
    "authentication failed",
    "unauthorized",
    "extraction failed",
    "extractions failed",
    "document extraction failed",
    "full extraction failed",
    "extractor error",
    "bad gateway",
    "upstream error",
  ].some((needle) => value.includes(needle));

  const technical5xx =
    /\b(?:extract(?:ion|or)?|provider|model|service|gateway|http|status|error)\b[^.\n]{0,40}\b5\d\d\b/i.test(text)
    || /\b5\d\d\b[^.\n]{0,40}\b(?:extract(?:ion|or)?|provider|model|service|gateway|http|status|error)\b/i.test(text);

  return knownDiagnostic || technical5xx;
}

function narratesCounterparty(text: string) {
  return /\b(?:the\s+)?(?:buyer|seller)\s+(?:said|says|asked|requested|clarified|confirmed|accepted|rejected|proposed|wants|needs|provided|uploaded|agreed)\b/i.test(text);
}

function looksLikePrecisionChatter(text: string) {
  return /\b(?:full precision|quantity decimals?|price decimals?|decimal formatting|more units)\b/i.test(text)
    || /\b\d+\.0{2,}\s*(?:mt|kg|tons?|containers?)\b/i.test(text);
}

function containsInternalLeak(text: string) {
  const value = text.toLowerCase();
  const internalTerms = [
    "hermes agent",
    "agent docs",
    "nousresearch",
    "feature question",
    "internal feature",
    "model provider",
    "backend service",
  ].some((term) => value.includes(term));

  return internalTerms
    || /storage:\/\//i.test(text)
    || /\/opt\/render\//i.test(text)
    || /supabase\.co\/storage\//i.test(text)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(text);
}

export function looksLikeNewTradeIntake(text: string) {
  const normalized = text.trim().toLowerCase();
  const quantity = /\b\d+(?:\.\d+)?\s*(?:mt|ton|tons|kg|kgs|container|containers)\b/i;
  if (!quantity.test(normalized)) return false;

  if (/\b(?:new|another|separate|different|also)\s+(?:requirement|deal|order|trade|shipment)\b/.test(normalized)) {
    return true;
  }

  if (!/\b(?:need|want|buy|supply|sell|offer|deliver|delivered)\b/.test(normalized)) {
    return false;
  }

  const match = normalized.match(/\b\d+(?:\.\d+)?\s*(?:mt|ton|tons|kg|kgs|container|containers)\b\s+([^$\d][^$]{0,80})/i);
  if (!match?.[1]) return false;

  const tail = match[1]
    .split(/\b(?:at|for|with|payment|price|usd|aed|inr|eur|after|before)\b/i)[0]
    ?.trim() ?? "";

  const productWords = tail
    .replace(/\b(?:delivered|delivery|to|from|cif|fob|cfr|exw)\b/gi, " ")
    .replace(/[^a-z]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  return productWords.length > 0;
}

function highConfidenceIntent(text: string) {
  const normalized = text.trim().toLowerCase();

  if (/^(?:hi|hy|hello|hey|yo|sup|gm|good morning|good afternoon|good evening)[.! ]*$/i.test(normalized)) {
    return "casual";
  }

  if (looksLikeNewTradeIntake(normalized)) return "new_trade_intake";

  if ([
    /\b(?:i|we)\s+(?:agree|accept|confirm|approve)\b/,
    /\b(?:i|we)\s+(?:will|want to)\s+(?:proceed|continue|move ahead|move forward|go forward)\b/,
    /\b(?:accepted|agreed|confirmed)\b/,
  ].some((pattern) => pattern.test(normalized))) {
    return "acceptance";
  }

  if ([
    /\b(?:i|we)\s+(?:reject|decline|do not accept|don't accept|will not proceed|won't proceed)\b/,
    /\b(?:rejected|declined|not interested|cancel the deal)\b/,
  ].some((pattern) => pattern.test(normalized))) {
    return "rejection";
  }

  if ([
    /\b(?:counter|counteroffer|counter offer|make it|lower the price|too expensive|price is too high|can (?:you|he|she|they|seller|buyer) do)\b/,
    /\$\s*\d[\d,.]*/,
    /\b(?:usd|aed|inr|eur)\s*\d[\d,.]*/i,
    /\b\d[\d,.]*\s*(?:usd|aed|inr|eur)\b/i,
  ].some((pattern) => pattern.test(normalized))) {
    return "counteroffer";
  }

  if (/\b(?:send|share|provide|upload|need|require|where|whr)\b.*\b(?:document|documents|coa|coi|sgs|bl|bill of lading|icpo|loi|fco|sco|spa|proof|certificate)\b/i.test(normalized)) {
    return "document_request";
  }

  if (/\b(?:meet|meeting|call|video call|zoom|teams|appointment)\b/i.test(normalized)) {
    return "meeting_request";
  }

  if (/\b(?:status|stage|deal update|where are we with (?:this|the) deal|where is (?:this|the) deal)\b/i.test(normalized)) {
    return "status_question";
  }

  return null;
}

function isFixedPaymentPolicyMessage(text: string) {
  const normalized = text.trim().toLowerCase();

  const asksPayment =
    /\b(?:payment terms?|payment method|how (?:do|will|should) (?:i|we|you) pay|how is payment|how does payment work|what payment|which payment)\b/i.test(normalized);

  const alternativeInstrument =
    /\b(?:tt|t\/t|mt103|sblc|standby letter of credit|lc|letter of credit|cash on delivery|cod|escrow|bank transfer|wire transfer)\b/i.test(normalized)
    && !/\bdlc\b/i.test(normalized);

  return asksPayment || alternativeInstrument;
}

function fixedPaymentPolicyDecision(): DealConversationDecision {
  return {
    intent: "deal_question",
    replyToSender: "We use DLC with release after SGS at destination.",
    relay: false,
    relayToCounterparty: null,
    newTradeIntake: false,
  };
}

function deterministicCopy(intent: string, participantRole: string, message: string) {
  const clean = message.trim().slice(0, 900);
  const recipientFramed = participantRole === "buyer"
    ? clean
        .replace(/\b(?:the\s+)?seller\b/gi, "you")
        .replace(/\bcan\s+(?:he|she|they)\b/gi, "can you")
        .replace(/^\s*(?:i|we)\s+can\s+do\s+/i, "Can you do ")
    : clean
        .replace(/\b(?:the\s+)?buyer\b/gi, "you")
        .replace(/\bcan\s+(?:he|she|they)\b/gi, "can you")
        .replace(/^\s*(?:i|we)\s+can\s+do\s+/i, "Can you do ");

  switch (intent) {
    case "acceptance":
      return {
        replyToSender: "Perfect. I’ll move it forward from here.",
        relay: true,
        relayToCounterparty: "Perfect, we’re aligned on those terms. I’ll move this to the next step.",
      };
    case "rejection":
      return {
        replyToSender: "No problem. Send me what would work for you and I’ll take it from there.",
        relay: true,
        relayToCounterparty: "That won’t work as it stands. What’s your best revised offer?",
      };
    case "counteroffer":
      return {
        replyToSender: "Got it. I’ll check that and come back to you.",
        relay: true,
        relayToCounterparty: `${recipientFramed.charAt(0).toUpperCase() + recipientFramed.slice(1)}${/[?.!]$/.test(recipientFramed) ? "" : "?"} If not, send me your best.`,
      };
    case "document_request":
      return {
        replyToSender: "Sure, I’ll sort that.",
        relay: true,
        relayToCounterparty: "Can you send that document over?",
      };
    case "meeting_request":
      return {
        replyToSender: "Sure. I’ll set it up and get back to you.",
        relay: true,
        relayToCounterparty: `${recipientFramed.charAt(0).toUpperCase() + recipientFramed.slice(1)} What time works for you?`,
      };
    default:
      return null;
  }
}

export function preflightDealDecision(input: {
  participantRole: string;
  incomingMessage: string;
  replyContextKind?: string;
}): DealConversationDecision | null {
  const normalized = input.incomingMessage.trim().toLowerCase();
  const shortReply = /^(?:yes|yep|yeah|yup|ok|okay|sure|fine|no|nope|nah|done|go ahead|proceed)[.! ]*$/i.test(normalized);
  const affirmative = /^(?:yes|yep|yeah|yup|ok|okay|sure|fine|done|go ahead|proceed)[.! ]*$/i.test(normalized);
  const negative = /^(?:no|nope|nah)[.! ]*$/i.test(normalized);
  const exactCounteroffer = Boolean(input.replyContextKind?.startsWith("mediated_counteroffer:"));
  const documentContext = Boolean(input.replyContextKind?.includes("document"));

  if (isFixedPaymentPolicyMessage(input.incomingMessage)) {
    return fixedPaymentPolicyDecision();
  }

  if (shortReply) {
    if (exactCounteroffer && affirmative) {
      return {
        intent: "acceptance",
        replyToSender: "Perfect.",
        relay: true,
        relayToCounterparty: "Perfect, those terms work. I’ll move us to the next step.",
        newTradeIntake: false,
      };
    }

    if (exactCounteroffer && negative) {
      return {
        intent: "rejection",
        replyToSender: "No problem.",
        relay: true,
        relayToCounterparty: "That one won’t work. What’s your best revised offer?",
        newTradeIntake: false,
      };
    }

    if (documentContext) {
      return {
        intent: "document_request",
        replyToSender: "Got it.",
        relay: false,
        relayToCounterparty: null,
        newTradeIntake: false,
      };
    }

    return {
      intent: "casual",
      replyToSender: "Got it.",
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: false,
    };
  }

  const intent = highConfidenceIntent(input.incomingMessage);
  if (!intent) return null;

  if (intent === "new_trade_intake") {
    return {
      intent,
      replyToSender: "",
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: true,
    };
  }

  if (intent === "casual") {
    return {
      intent,
      replyToSender: "Hey, what’s up?",
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: false,
    };
  }

  if (intent === "status_question") {
    return null;
  }

  const deterministic = deterministicCopy(intent, input.participantRole, input.incomingMessage);
  return deterministic
    ? {
        intent,
        replyToSender: deterministic.replyToSender,
        relay: deterministic.relay,
        relayToCounterparty: deterministic.relayToCounterparty,
        newTradeIntake: false,
      }
    : null;
}

function structuredReplyFallback(intent: string, deal: DealStateForReply) {
  if (intent === "status_question") {
    return `We’re still in ${deal.status}. Right now it’s ${formatTradeQuantity(deal.quantity)} ${deal.unit} at ${formatTradeMoney(deal.currency, deal.agreedPrice)}/${deal.unit}.`;
  }

  if (intent === "deal_question") {
    return `Yep, I’ve got it. It’s ${formatTradeQuantity(deal.quantity)} ${deal.unit} at ${formatTradeMoney(deal.currency, deal.agreedPrice)}/${deal.unit}, and we’re in ${deal.status}. What do you want to check?`;
  }

  if (intent === "document_request") {
    return "Which document do you need?";
  }

  if (intent === "casual") {
    return "What’s up?";
  }

  if (intent === "clarification") {
    return "What do you want me to clarify?";
  }

  if (intent === "counterparty_question") {
    return "I’ll check that and come back to you if I need anything else.";
  }

  return "I’m with you. What do you want to do next?";
}

function plainLanguageFallback(input: {
  content: string;
  participantRole: string;
  incomingMessage: string;
  replyContextKind?: string;
  deal: DealStateForReply;
}): DealConversationDecision | null {
  const reply = input.content.trim().slice(0, 1200);
  if (!reply || looksLikeProviderDiagnostic(reply)) return null;
  if (looksStructured(reply) || containsInternalLeak(reply) || narratesCounterparty(reply)) {
    return {
      intent: "other",
      replyToSender: structuredReplyFallback("other", input.deal),
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: false,
    };
  }

  if (looksLikeNewTradeIntake(input.incomingMessage)) {
    return {
      intent: "new_trade_intake",
      replyToSender: "",
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: true,
    };
  }

  const normalized = input.incomingMessage.trim().toLowerCase();
  if (/^(?:hi|hy|hello|hey|yo|sup|gm|good morning|good afternoon|good evening)[.! ]*$/i.test(normalized)) {
    return {
      intent: "casual",
      replyToSender: reply,
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: false,
    };
  }

  const shortReply = /^(?:yes|yep|yeah|yup|ok|okay|sure|fine|no|nope|nah|done|go ahead|proceed)[.! ]*$/i.test(normalized);
  if (shortReply) {
    const explicitCommercialReply = Boolean(input.replyContextKind?.startsWith("mediated_counteroffer:"));
    const explicitDocumentReply = Boolean(input.replyContextKind?.includes("document"));
    const affirmative = /^(?:yes|yep|yeah|yup|ok|okay|sure|fine|done|go ahead|proceed)[.! ]*$/i.test(normalized);
    const negative = /^(?:no|nope|nah)[.! ]*$/i.test(normalized);

    if (explicitCommercialReply && affirmative) {
      return {
        intent: "acceptance",
        replyToSender: reply,
        relay: true,
        relayToCounterparty: "Perfect, those terms work. I’ll move us to the next step.",
        newTradeIntake: false,
      };
    }

    if (explicitCommercialReply && negative) {
      return {
        intent: "rejection",
        replyToSender: reply,
        relay: true,
        relayToCounterparty: "That one won’t work. What’s your best revised offer?",
        newTradeIntake: false,
      };
    }

    if (explicitDocumentReply) {
      return {
        intent: "document_request",
        replyToSender: reply,
        relay: false,
        relayToCounterparty: null,
        newTradeIntake: false,
      };
    }

    return {
      intent: "casual",
      replyToSender: reply,
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: false,
    };
  }

  const acceptance = [
    /\b(?:i|we)\s+(?:agree|accept|confirm|approve)\b/,
    /\b(?:i|we)\s+(?:will|want to)\s+(?:proceed|continue|move ahead|move forward|go forward)\b/,
    /\b(?:accepted|agreed|confirmed)\b/,
  ].some((pattern) => pattern.test(normalized));

  if (acceptance) {
    return {
      intent: "acceptance",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: "Perfect, we’re aligned on those terms. I’ll move this to the next step.",
      newTradeIntake: false,
    };
  }

  const rejection = [
    /\b(?:i|we)\s+(?:reject|decline|do not accept|don't accept)\b/,
    /\b(?:rejected|declined|not interested|cancel the deal)\b/,
  ].some((pattern) => pattern.test(normalized));

  if (rejection) {
    return {
      intent: "rejection",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: "That won’t work as it stands. What’s your best revised offer?",
      newTradeIntake: false,
    };
  }

  const counteroffer = [
    /\b(?:counter|counteroffer|counter offer|make it|lower the price|too expensive|price is too high|can you do)\b/,
    /\$\s*\d[\d,.]*/,
    /\b(?:usd|aed|inr|eur)\s*\d[\d,.]*/i,
    /\b\d[\d,.]*\s*(?:usd|aed|inr|eur)\b/i,
  ].some((pattern) => pattern.test(normalized));

  if (counteroffer) {
    return {
      intent: "counteroffer",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `${input.incomingMessage.trim().slice(0, 900)} If not, send me your best.`,
      newTradeIntake: false,
    };
  }

  if (/\b(?:send|share|provide|upload|need|require|where|whr)\b.*\b(?:document|documents|coa|coi|sgs|bl|bill of lading|icpo|loi|fco|sco|spa|proof|certificate)\b/i.test(normalized)) {
    return {
      intent: "document_request",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: "Can you send that document over?",
      newTradeIntake: false,
    };
  }

  if (/\b(?:meet|meeting|call|video call|zoom|teams|appointment)\b/i.test(normalized)) {
    return {
      intent: "meeting_request",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `${input.incomingMessage.trim().slice(0, 900)} What time works for you?`,
      newTradeIntake: false,
    };
  }

  const question = /\?$/.test(normalized)
    || /^(?:can|could|will|would|does|do|is|are|when|where|whr|what|wht|how|why|who)\b/.test(normalized);

  return {
    intent: question ? "counterparty_question" : "other",
    replyToSender: reply,
    relay: false,
    relayToCounterparty: null,
    newTradeIntake: false,
  };
}

export function normalizeModelDecision(input: {
  content: string;
  participantRole: string;
  incomingMessage: string;
  replyContextKind?: string;
  deal: DealStateForReply;
}): DealConversationDecision | null {
  const normalizedIncoming = input.incomingMessage.trim().toLowerCase();
  const shortReply = /^(?:yes|yep|yeah|yup|ok|okay|sure|fine|no|nope|nah|done|go ahead|proceed)[.! ]*$/i.test(normalizedIncoming);
  const affirmativeShortReply = /^(?:yes|yep|yeah|yup|ok|okay|sure|fine|done|go ahead|proceed)[.! ]*$/i.test(normalizedIncoming);
  const negativeShortReply = /^(?:no|nope|nah)[.! ]*$/i.test(normalizedIncoming);
  const explicitCommercialReply = Boolean(input.replyContextKind?.startsWith("mediated_counteroffer:"));
  const explicitDocumentReply = Boolean(input.replyContextKind?.includes("document"));
  const greeting = /^(?:hi|hy|hello|hey|yo|sup|gm|good morning|good afternoon|good evening)[.! ]*$/i.test(normalizedIncoming);
  const tradeKnowledgeQuestion =
    /\b(?:what|wht)\s+(?:is|are|does)\b.*\b(?:dlc|lc|sblc|sgs|cif|fob|pb|performance bond|icpo|loi|fco|sco|spa|ncnda|bcl|pof|pop|mt103|bill of lading|bl)\b/i.test(normalizedIncoming)
    || /\b(?:explain|meaning of|what does)\b.*\b(?:dlc|lc|sblc|sgs|cif|fob|pb|performance bond|icpo|loi|fco|sco|spa|ncnda|bcl|pof|pop|mt103|bill of lading|bl)\b/i.test(normalizedIncoming);
  const deterministicIntent = highConfidenceIntent(input.incomingMessage);

  if (isFixedPaymentPolicyMessage(input.incomingMessage)) {
    return fixedPaymentPolicyDecision();
  }

  const json = extractJson(input.content);
  if (!json) return plainLanguageFallback(input);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {
      intent: "other",
      replyToSender: structuredReplyFallback("other", input.deal),
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: false,
    };
  }

  let intent = typeof parsed.intent === "string" && allowedIntents.has(parsed.intent)
    ? parsed.intent
    : "other";

  // Never trust the model to turn an unanchored one-word reply into a commercial
  // commitment. WhatsApp reply context is the authority for yes/no/ok.
  if (shortReply) {
    if (explicitCommercialReply && affirmativeShortReply) intent = "acceptance";
    else if (explicitCommercialReply && negativeShortReply) intent = "rejection";
    else if (explicitDocumentReply) intent = "document_request";
    else intent = "casual";
  } else if (greeting) {
    intent = "casual";
  } else if (deterministicIntent) {
    intent = deterministicIntent;
  }

  const newTradeIntakeRequested = parsed.newTradeIntake === true || intent === "new_trade_intake";
  const newTradeIntake = newTradeIntakeRequested && looksLikeNewTradeIntake(input.incomingMessage);
  if (newTradeIntake) {
    return {
      intent: "new_trade_intake",
      replyToSender: "",
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: true,
    };
  }

  if (newTradeIntakeRequested && !newTradeIntake && intent === "new_trade_intake") {
    intent = deterministicIntent && deterministicIntent !== "new_trade_intake"
      ? deterministicIntent
      : "other";
  }

  const deterministic = deterministicCopy(intent, input.participantRole, input.incomingMessage);
  const rawReply = typeof parsed.replyToSender === "string"
    ? parsed.replyToSender.trim().slice(0, 1200)
    : "";

  const replyToSender = deterministic?.replyToSender
    ?? (rawReply
      && !containsInternalLeak(rawReply)
      && !looksLikeProviderDiagnostic(rawReply)
      && !narratesCounterparty(rawReply)
      && !looksLikePrecisionChatter(rawReply)
      ? rawReply
      : structuredReplyFallback(intent, input.deal));

  let relayRequested = deterministic?.relay ?? (parsed.relay === true);

  // Greetings, general trade-term questions, status checks, and unanchored short
  // replies never need the counterparty. This blocks unnecessary forwarding even
  // if the model incorrectly asks to relay.
  if (
    greeting
    || tradeKnowledgeQuestion
    || intent === "status_question"
    || (shortReply && !explicitCommercialReply)
  ) {
    relayRequested = false;
  }
  const rawRelay = deterministic?.relayToCounterparty
    ?? (relayRequested && typeof parsed.relayToCounterparty === "string"
      ? parsed.relayToCounterparty.trim().slice(0, 1200)
      : "");

  const relayToCounterparty = rawRelay
    && !containsInternalLeak(rawRelay)
    && !looksLikeProviderDiagnostic(rawRelay)
    && !narratesCounterparty(rawRelay)
    && !looksLikePrecisionChatter(rawRelay)
    ? rawRelay
    : null;

  return {
    intent,
    replyToSender,
    relay: Boolean(relayRequested && relayToCounterparty),
    relayToCounterparty,
    newTradeIntake: false,
  };
}

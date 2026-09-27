export type DealConversationDecision = {
  intent: string;
  replyToSender: string;
  relay: boolean;
  relayToCounterparty: string | null;
  newTradeIntake: boolean;
};

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
  return [
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
  ].some((needle) => value.includes(needle));
}

function containsInternalLeak(text: string) {
  return /storage:\/\//i.test(text)
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

function deterministicCopy(intent: string, participantRole: string, message: string) {
  const clean = message.trim().slice(0, 900);
  const recipientFramed = participantRole === "buyer"
    ? clean
        .replace(/\b(?:the\s+)?seller\b/gi, "you")
        .replace(/\bcan\s+(?:he|she|they)\b/gi, "can you")
        .replace(/^\s*(?:i|we)\s+can\s+do\s+/i, "Can you work with ")
    : clean
        .replace(/\b(?:the\s+)?buyer\b/gi, "you")
        .replace(/\bcan\s+(?:he|she|they)\b/gi, "can you")
        .replace(/^\s*(?:i|we)\s+can\s+do\s+/i, "Can you work with ");

  switch (intent) {
    case "acceptance":
      return {
        replyToSender: "Got it. I recorded that you want to proceed. I’ll keep the next step tied to the exact deal context.",
        relay: true,
        relayToCounterparty: "The current terms can move forward. Please confirm you’re ready for the next step.",
      };
    case "rejection":
      return {
        replyToSender: "Understood. I recorded that you do not accept the current terms.",
        relay: true,
        relayToCounterparty: "The current terms weren’t accepted. Send revised terms if you want me to keep negotiating.",
      };
    case "counteroffer":
      return {
        replyToSender: "Got it. I recorded the revised commercial terms and I’ll take only those terms to the other side.",
        relay: true,
        relayToCounterparty: `Can you work with these revised terms: ${recipientFramed} Please confirm or send your counter.`,
      };
    case "document_request":
      return {
        replyToSender: "I’ve noted the document request. I’ll use the document already attached to this deal when available; otherwise I’ll ask the other side only for what is needed.",
        relay: true,
        relayToCounterparty: `Please provide this for the deal: ${recipientFramed}`,
      };
    case "meeting_request":
      return {
        replyToSender: "I’ll coordinate the meeting request and come back with the other side’s availability.",
        relay: true,
        relayToCounterparty: `Can we arrange this meeting: ${recipientFramed} Please send your availability.`,
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

  if (shortReply) {
    if (exactCounteroffer && affirmative) {
      return {
        intent: "acceptance",
        replyToSender: "Confirmed. I recorded your reply to that exact counteroffer.",
        relay: true,
        relayToCounterparty: "Your counteroffer has been accepted. I’ll keep the next step tied to those exact terms.",
        newTradeIntake: false,
      };
    }

    if (exactCounteroffer && negative) {
      return {
        intent: "rejection",
        replyToSender: "Understood. I recorded your rejection of that exact counteroffer.",
        relay: true,
        relayToCounterparty: "That counteroffer wasn’t accepted. Send revised terms if you want me to keep negotiating.",
        newTradeIntake: false,
      };
    }

    if (documentContext) {
      return {
        intent: "document_request",
        replyToSender: "Got it. I’ll keep this reply tied to the document request.",
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
      replyToSender: "Hi. I’m here with this deal. Tell me what you need.",
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
    return `The deal is currently in ${deal.status}. Confirmed terms in UDC are ${deal.quantity} ${deal.unit} at ${deal.currency} ${deal.agreedPrice}/${deal.unit}. Tell me if you want the latest document, payment status, or next step.`;
  }

  if (intent === "deal_question") {
    return `I have the current deal open. Confirmed terms are ${deal.quantity} ${deal.unit} at ${deal.currency} ${deal.agreedPrice}/${deal.unit}, and the deal is in ${deal.status}. What do you want to check?`;
  }

  if (intent === "document_request") {
    return "I understand the document request. Tell me which document you need and I’ll check what is attached to this deal.";
  }

  if (intent === "casual") {
    return "I’m here. Tell me what you need for this deal.";
  }

  if (intent === "clarification") {
    return "Tell me what you want clarified and I’ll answer from the current deal record.";
  }

  if (intent === "counterparty_question") {
    return "I understand the question. I’ll answer from the deal record if UDC already knows it; otherwise I’ll ask the other party only if their input is actually needed.";
  }

  return "I understood your message, but the AI reply format was invalid. I kept it inside this deal and did not forward anything incorrectly. Please send the request again.";
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
  if (looksStructured(reply) || containsInternalLeak(reply)) {
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
        relayToCounterparty: "Your counteroffer has been accepted. I’ll keep the next step tied to those exact terms.",
        newTradeIntake: false,
      };
    }

    if (explicitCommercialReply && negative) {
      return {
        intent: "rejection",
        replyToSender: reply,
        relay: true,
        relayToCounterparty: "That counteroffer wasn’t accepted. Send revised terms if you want me to keep negotiating.",
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
      relayToCounterparty: "The current terms can move forward. Please confirm you’re ready for the next step.",
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
      relayToCounterparty: "The current terms weren’t accepted. Send revised terms if you want me to keep negotiating.",
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
      relayToCounterparty: `Can you work with these revised terms: ${input.incomingMessage.trim().slice(0, 900)} Please confirm or send your counter.`,
      newTradeIntake: false,
    };
  }

  if (/\b(?:send|share|provide|upload|need|require|where|whr)\b.*\b(?:document|documents|coa|coi|sgs|bl|bill of lading|icpo|loi|fco|sco|spa|proof|certificate)\b/i.test(normalized)) {
    return {
      intent: "document_request",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `Please provide this for the deal: ${input.incomingMessage.trim().slice(0, 900)}`,
      newTradeIntake: false,
    };
  }

  if (/\b(?:meet|meeting|call|video call|zoom|teams|appointment)\b/i.test(normalized)) {
    return {
      intent: "meeting_request",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `Can we arrange this meeting: ${input.incomingMessage.trim().slice(0, 900)} Please send your availability.`,
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

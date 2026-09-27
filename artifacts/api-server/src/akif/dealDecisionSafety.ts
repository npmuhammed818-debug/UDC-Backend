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

function looksLikeNewTradeIntake(text: string) {
  const normalized = text.toLowerCase();
  return /\b\d+(?:\.\d+)?\s*(?:mt|ton|tons|kg|kgs|container|containers)\b/.test(normalized)
    && /\b(?:need|want|buy|supply|sell|offer|deliver|delivered|from|to)\b/.test(normalized);
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
  const party = input.participantRole === "buyer" ? "buyer" : "seller";

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
        relayToCounterparty: `The ${party} accepted the exact counteroffer they replied to.`,
        newTradeIntake: false,
      };
    }

    if (explicitCommercialReply && negative) {
      return {
        intent: "rejection",
        replyToSender: reply,
        relay: true,
        relayToCounterparty: `The ${party} rejected the exact counteroffer they replied to.`,
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
      relayToCounterparty: `The ${party} confirmed they want to proceed on the stated terms. Please confirm your side so UDC can coordinate the next step.`,
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
      relayToCounterparty: `The ${party} does not accept the current terms. UDC can keep the negotiation open for revised terms.`,
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
      relayToCounterparty: `The ${party} proposed revised commercial terms: ${input.incomingMessage.trim().slice(0, 900)} Please confirm whether you accept or send your counter.`,
      newTradeIntake: false,
    };
  }

  if (/\b(?:send|share|provide|upload|need|require|where|whr)\b.*\b(?:document|documents|coa|coi|sgs|bl|bill of lading|icpo|loi|fco|sco|spa|proof|certificate)\b/i.test(normalized)) {
    return {
      intent: "document_request",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `The ${party} requested this deal document/information: ${input.incomingMessage.trim().slice(0, 900)}`,
      newTradeIntake: false,
    };
  }

  if (/\b(?:meet|meeting|call|video call|zoom|teams|appointment)\b/i.test(normalized)) {
    return {
      intent: "meeting_request",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `The ${party} would like to arrange a meeting: ${input.incomingMessage.trim().slice(0, 900)} Please send your availability.`,
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

  const intent = typeof parsed.intent === "string" && allowedIntents.has(parsed.intent)
    ? parsed.intent
    : "other";

  const newTradeIntake = parsed.newTradeIntake === true || intent === "new_trade_intake";
  if (newTradeIntake) {
    return {
      intent: "new_trade_intake",
      replyToSender: "",
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: true,
    };
  }

  const rawReply = typeof parsed.replyToSender === "string"
    ? parsed.replyToSender.trim().slice(0, 1200)
    : "";

  const replyToSender = rawReply && !containsInternalLeak(rawReply)
    ? rawReply
    : structuredReplyFallback(intent, input.deal);

  const relayRequested = parsed.relay === true;
  const rawRelay = relayRequested && typeof parsed.relayToCounterparty === "string"
    ? parsed.relayToCounterparty.trim().slice(0, 1200)
    : "";

  const relayToCounterparty = rawRelay && !containsInternalLeak(rawRelay)
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

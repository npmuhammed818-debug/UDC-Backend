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

export function isSafeConversationText(text: string) {
  return Boolean(text.trim()) && !containsInternalLeak(text)
    && !looksLikeProviderDiagnostic(text) && !narratesCounterparty(text)
    && !looksLikePrecisionChatter(text) && !looksStructured(text);
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

  const json = extractJson(input.content);
  if (!json) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

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
    intent = "other";
  }

  const rawReply = typeof parsed.replyToSender === "string"
    ? parsed.replyToSender.trim().slice(0, 1200)
    : "";

  const replyToSender = rawReply
      && !containsInternalLeak(rawReply)
      && !looksLikeProviderDiagnostic(rawReply)
      && !narratesCounterparty(rawReply)
      && !looksLikePrecisionChatter(rawReply)
      && !looksStructured(rawReply)
      ? rawReply
      : null;
  if (!replyToSender) return null;

  let relayRequested = parsed.relay === true;

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
  const rawRelay = relayRequested && typeof parsed.relayToCounterparty === "string"
      ? parsed.relayToCounterparty.trim().slice(0, 1200)
      : "";

  const relayToCounterparty = rawRelay
    && !containsInternalLeak(rawRelay)
    && !looksLikeProviderDiagnostic(rawRelay)
    && !narratesCounterparty(rawRelay)
    && !looksLikePrecisionChatter(rawRelay)
    && !looksStructured(rawRelay)
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

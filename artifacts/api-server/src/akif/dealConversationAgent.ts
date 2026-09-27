import { desc, eq } from "drizzle-orm";
import { db, dealConversationEventsTable, dealIntelligenceSnapshotsTable, dealsTable } from "@workspace/db";
import { runHermesChat } from "./intelligence/hermesClient";

export type DealConversationDecision = {
  intent: string;
  replyToSender: string;
  relay: boolean;
  relayToCounterparty: string | null;
  newTradeIntake: boolean;
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

function cleanJson(raw: string) {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return unfenced.slice(start, end + 1);
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

function looksLikeNewTradeIntake(text: string) {
  const normalized = text.toLowerCase();
  return /\b\d+(?:\.\d+)?\s*(?:mt|ton|tons|kg|kgs|container|containers)\b/.test(normalized)
    && /\b(?:need|want|buy|supply|sell|offer|deliver|delivered|from|to)\b/.test(normalized);
}

/**
 * Formatting must never take the WhatsApp conversation offline.
 *
 * If an upstream model returns useful natural language instead of the requested
 * JSON object, keep the sender response and infer only a small set of explicit,
 * low-ambiguity relay intents from the sender's ORIGINAL text. Questions and
 * unknown messages are never relayed by this fallback.
 */
function naturalLanguageFallback(
  content: string,
  participantRole: string,
  incomingMessage: string,
): DealConversationDecision | null {
  const reply = content.trim().slice(0, 1200);
  if (!reply || looksLikeProviderDiagnostic(reply)) return null;

  if (looksLikeNewTradeIntake(incomingMessage)) {
    return {
      intent: "new_trade_intake",
      replyToSender: "",
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: true,
    };
  }

  const normalized = incomingMessage.trim().toLowerCase();
  const party = participantRole === "buyer" ? "buyer" : "seller";

  const acceptance = [
    /\b(?:i|we)\s+(?:agree|accept|confirm|approve)\b/,
    /\b(?:i|we)\s+(?:will|want to)\s+(?:proceed|continue|move ahead|move forward|go forward)\b/,
    /\b(?:accepted|agreed|confirmed|go ahead|move ahead|proceed)\b/,
  ].some((pattern) => pattern.test(normalized));

  if (acceptance) {
    return {
      intent: "acceptance",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `The ${party} has confirmed they want to proceed on the stated terms. Please confirm your side so UDC can coordinate the next step.`,
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
      relayToCounterparty: `The ${party} does not accept the current terms. UDC will keep the negotiation open for revised terms if appropriate.`,
      newTradeIntake: false,
    };
  }

  const counteroffer = [
    /\b(?:counter|counteroffer|counter offer|make it|lower the price|too expensive|price is too high|can you do)\b/,
    /\b(?:usd|aed|inr|eur)\s*\d[\d,.]*/i,
    /\b\d[\d,.]*\s*(?:usd|aed|inr|eur)\b/i,
  ].some((pattern) => pattern.test(normalized));

  if (counteroffer) {
    return {
      intent: "counteroffer",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `The ${party} has proposed revised commercial terms: ${incomingMessage.trim().slice(0, 900)} Please confirm whether you accept or send your counter.`,
      newTradeIntake: false,
    };
  }

  if (/\b(?:send|share|provide|upload|need|require)\b.*\b(?:document|documents|coa|coi|sgs|bl|bill of lading|icpo|loi|fco|sco|spa|proof|certificate)\b/i.test(normalized)) {
    return {
      intent: "document_request",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `The ${party} requested the following deal information/document: ${incomingMessage.trim().slice(0, 900)} Please provide only the relevant material when ready.`,
      newTradeIntake: false,
    };
  }

  if (/\b(?:meet|meeting|call|video call|zoom|teams|appointment)\b/i.test(normalized)) {
    return {
      intent: "meeting_request",
      replyToSender: reply,
      relay: true,
      relayToCounterparty: `The ${party} would like to arrange a meeting: ${incomingMessage.trim().slice(0, 900)} Please send your availability.`,
      newTradeIntake: false,
    };
  }

  if (/^(?:ok|okay|fine|sure|yes|no|thanks|thank you|got it|understood|alright|cool|wait|later)[.! ]*$/i.test(normalized)) {
    return {
      intent: "casual",
      replyToSender: reply,
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: false,
    };
  }

  const question = /\?$/.test(normalized)
    || /^(?:can|could|will|would|does|do|is|are|when|where|what|how|why)\b/.test(normalized);

  return {
    intent: question ? "counterparty_question" : "other",
    replyToSender: reply,
    relay: false,
    relayToCounterparty: null,
    newTradeIntake: false,
  };
}

export async function interpretActiveDealConversation(input: {
  dealId: string;
  participantRole: string;
  message: string;
  replyContextKind?: string;
}): Promise<DealConversationDecision | null> {
  const [deal] = await db
    .select({
      dealNumber: dealsTable.dealNumber,
      status: dealsTable.status,
      quantity: dealsTable.quantity,
      unit: dealsTable.unit,
      agreedPrice: dealsTable.agreedPrice,
      currency: dealsTable.currency,
      incoterm: dealsTable.incoterm,
      destination: dealsTable.destination,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, input.dealId))
    .limit(1);

  if (!deal) return null;

  const [history, snapshotRows] = await Promise.all([
    db.select({
      id: dealConversationEventsTable.id,
      participantRole: dealConversationEventsTable.participantRole,
      intent: dealConversationEventsTable.intent,
      originalText: dealConversationEventsTable.originalText,
      relayText: dealConversationEventsTable.relayText,
      relayed: dealConversationEventsTable.relayed,
      createdAt: dealConversationEventsTable.createdAt,
    })
      .from(dealConversationEventsTable)
      .where(eq(dealConversationEventsTable.dealId, input.dealId))
      .orderBy(desc(dealConversationEventsTable.createdAt))
      .limit(8),
    db.select({ snapshot: dealIntelligenceSnapshotsTable.snapshot })
      .from(dealIntelligenceSnapshotsTable)
      .where(eq(dealIntelligenceSnapshotsTable.dealId, input.dealId))
      .limit(1),
  ]);

  const dealMemory = snapshotRows[0]?.snapshot ?? null;

  const system = [
    "You are AKIF, the human-like trade coordinator inside UDC.",
    "This WhatsApp user is already inside an active B2B deal conversation.",
    "Understand ordinary natural language as a skilled human intermediary would; do not depend on command phrases.",
    "Answer the sender directly when UDC already has enough context.",
    "Only involve the counterparty when their input or awareness is actually needed.",
    "Never blindly forward the sender's raw message. If relay is needed, summarize it naturally and professionally.",
    "Do not invent deal facts, company verification, documents, banking status, inspection results, shipment status, or legal conclusions.",
    "Do not execute or claim to execute payments, banking instruments, legal commitments, or document approvals.",
    "If the user proposes or accepts a commercial term, you may record/relay their stated position, but never invent acceptance by the other party.",
    "A short reply such as yes/no/ok must be interpreted only against replyContextKind when it is present. Never treat a bare yes/no as acceptance of price, quantity, payment, or other deal terms unless the replied-to context is explicitly a commercial offer or acceptance request.",
    "When replyContextKind contains an event id after a colon, match it to recentConversation.eventId and confirm only the terms that were actually present in that exact relayed message. Never add quantity, price, payment, or document terms from a different message.",
    "Keep buyer and seller roles separate. Never attribute a buyer statement to the seller or a seller statement to the buyer.",
    "Never expose internal storage:// paths, database UUIDs, service URLs, or backend implementation details in WhatsApp replies.",
    "If this is clearly a separate new buyer requirement or seller offer unrelated to the current deal, set newTradeIntake=true.",
    "Your ENTIRE response must be exactly one valid JSON object beginning with { and ending with }. No markdown, preface, explanation, or text outside the JSON.",
  ].join(" ");

  const user = JSON.stringify({
    participantRole: input.participantRole,
    deal: {
      dealNumber: deal.dealNumber,
      status: deal.status,
      quantity: deal.quantity,
      unit: deal.unit,
      agreedPrice: deal.agreedPrice,
      currency: deal.currency,
      incoterm: deal.incoterm,
      destination: deal.destination,
    },
    dealMemory,
    recentConversation: history.reverse().map((event) => ({
      eventId: event.id,
      role: event.participantRole,
      intent: event.intent,
      text: event.originalText,
      relayed: event.relayed,
      relaySummary: event.relayText,
    })),
    incomingMessage: input.message,
    replyContextKind: input.replyContextKind ?? null,
    requiredOutput: {
      intent: "one of acceptance, rejection, counteroffer, document_request, document_submission, meeting_request, counterparty_question, deal_question, status_question, casual, clarification, new_trade_intake, other",
      replyToSender: "natural concise WhatsApp reply from UDC to this sender",
      relay: "boolean; true only if counterparty needs to receive something now",
      relayToCounterparty: "natural concise UDC message to the other party, or null",
      newTradeIntake: "boolean",
    },
  });

  try {
    const { content } = await runHermesChat(user, system, 15_000);
    const json = cleanJson(content);

    if (!json) {
      console.warn("AKIF deal conversation returned non-JSON output; using safe natural-language fallback");
      return naturalLanguageFallback(content, input.participantRole, input.message);
    }

    let parsed: Partial<DealConversationDecision>;
    try {
      parsed = JSON.parse(json) as Partial<DealConversationDecision>;
    } catch {
      console.warn("AKIF deal conversation returned malformed JSON; using safe natural-language fallback");
      return naturalLanguageFallback(content, input.participantRole, input.message);
    }

    const intent = typeof parsed.intent === "string" && allowedIntents.has(parsed.intent)
      ? parsed.intent
      : "other";
    const replyToSender = typeof parsed.replyToSender === "string"
      ? parsed.replyToSender.trim().slice(0, 1200)
      : "";
    const newTradeIntake = parsed.newTradeIntake === true || intent === "new_trade_intake";
    const relayRequested = parsed.relay === true && !newTradeIntake;
    const relayToCounterparty = relayRequested && typeof parsed.relayToCounterparty === "string"
      ? parsed.relayToCounterparty.trim().slice(0, 1200)
      : null;
    const relay = Boolean(relayRequested && relayToCounterparty);

    if (newTradeIntake) {
      return {
        intent: "new_trade_intake",
        replyToSender: "",
        relay: false,
        relayToCounterparty: null,
        newTradeIntake: true,
      };
    }

    if (!replyToSender) {
      console.warn("AKIF deal conversation returned no sender reply");
      return naturalLanguageFallback(content, input.participantRole, input.message);
    }

    return {
      intent,
      replyToSender,
      relay,
      relayToCounterparty,
      newTradeIntake: false,
    };
  } catch (error) {
    // Keep commercial content and provider bodies out of logs.
    console.warn("AKIF deal conversation failed", {
      reason: error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : error instanceof SyntaxError
          ? "invalid_json"
          : "model_request_failed",
    });
    return null;
  }
}

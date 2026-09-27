import { desc, eq } from "drizzle-orm";
import { db, dealConversationEventsTable, dealIntelligenceSnapshotsTable, dealsTable } from "@workspace/db";
import { normalizeModelDecision, preflightDealDecision, type DealConversationDecision } from "./dealDecisionSafety";
import { runHermesChat } from "./intelligence/hermesClient";

export async function interpretActiveDealConversation(input: {
  dealId: string;
  participantRole: string;
  message: string;
  replyContextKind?: string;
}): Promise<DealConversationDecision | null> {
  const preflight = preflightDealDecision({
    participantRole: input.participantRole,
    incomingMessage: input.message,
    replyContextKind: input.replyContextKind,
  });
  if (preflight) return preflight;

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
    "The structured deal object is authoritative for confirmed quantity, price, currency, incoterm, destination and stage. recentConversation may contain proposals, failed turns, or older model wording and must not silently override the structured deal.",
    "Understand ordinary natural language, abbreviations, typos, and short WhatsApp-style messages as a skilled human intermediary would; do not depend on command phrases.",
    "Answer the sender directly when UDC already has enough context.",
    "Only involve the counterparty when their input or awareness is actually needed.",
    "Speak as UDC itself, in first-person coordinator voice. Do not narrate handoffs with phrases like 'the buyer said', 'the seller said', 'buyer asked', or 'seller requested'.",
    "When talking to either side, turn the information into a natural UDC message for that recipient, for example 'Can you do $5,900/MT after SGS?' or 'Here is the FCO for review.'",
    "Never blindly forward the sender's raw message. If relay is needed, rewrite it from UDC's own voice and preserve only the commercial facts or action needed.",
    "Do not invent deal facts, company verification, documents, banking status, inspection results, shipment status, or legal conclusions.",
    "Do not execute or claim to execute payments, banking instruments, legal commitments, or document approvals.",
    "If the user proposes or accepts a commercial term, you may record or relay their stated position, but never invent acceptance by the other party.",
    "A short reply such as yes, no, ok, sure, done, or proceed must be interpreted only against replyContextKind when it is present. Never treat a bare short reply as acceptance of price, quantity, payment, or other deal terms unless the replied-to context is explicitly the exact commercial offer.",
    "When replyContextKind contains an event id after a colon, match it to recentConversation.eventId and confirm only the terms that were actually present in that exact relayed message. Never add quantity, price, payment, or document terms from a different message.",
    "Keep buyer and seller roles separate. Never attribute a buyer statement to the seller or a seller statement to the buyer.",
    "Never expose internal storage paths, database UUIDs, service URLs, provider diagnostics, JSON control objects, or backend implementation details in WhatsApp replies.",
    "If this is clearly a separate new buyer requirement or seller offer unrelated to the current deal, set newTradeIntake=true.",
    "Your ENTIRE response must be exactly one valid JSON object beginning with { and ending with }. No markdown, preface, explanation, or text outside the JSON.",
    "replyToSender MUST always be a JSON string containing the actual natural WhatsApp sentence. NEVER use true, false, null, an object, or an array for replyToSender.",
    "relay MUST always be a JSON boolean. relayToCounterparty MUST be either a JSON string or null. newTradeIntake MUST always be a JSON boolean.",
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
      relayToCounterparty: "natural concise first-person UDC message for the recipient; never 'the buyer said'/'the seller said'; or null",
      newTradeIntake: "boolean",
    },
  });

  try {
    const { content } = await runHermesChat(user, system, 15_000);
    return normalizeModelDecision({
      content,
      participantRole: input.participantRole,
      incomingMessage: input.message,
      replyContextKind: input.replyContextKind,
      deal: {
        status: deal.status,
        quantity: deal.quantity,
        unit: deal.unit,
        agreedPrice: deal.agreedPrice,
        currency: deal.currency,
      },
    });
  } catch (error) {
    console.warn("AKIF deal conversation failed", {
      reason: error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : "model_request_failed",
    });
    return null;
  }
}

import { desc, eq } from "drizzle-orm";
import { db, dealConversationEventsTable, dealIntelligenceSnapshotsTable, dealsTable } from "@workspace/db";
import { runHermesChat } from "./intelligence/hermesClient";
import { refreshDealIntelligenceSnapshot } from "./documentIntelligence";

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

export async function interpretActiveDealConversation(input: {
  dealId: string;
  participantRole: string;
  message: string;
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

  await refreshDealIntelligenceSnapshot(input.dealId).catch(() => undefined);

  const [history, snapshotRows] = await Promise.all([
    db.select({
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
      .limit(12),
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
    "If this is clearly a separate new buyer requirement or seller offer unrelated to the current deal, set newTradeIntake=true.",
    "Return JSON only. No markdown.",
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
      role: event.participantRole,
      intent: event.intent,
      text: event.originalText,
      relayed: event.relayed,
      relaySummary: event.relayText,
    })),
    incomingMessage: input.message,
    requiredOutput: {
      intent: "one of acceptance, rejection, counteroffer, document_request, document_submission, meeting_request, counterparty_question, deal_question, status_question, casual, clarification, new_trade_intake, other",
      replyToSender: "natural concise WhatsApp reply from UDC to this sender",
      relay: "boolean; true only if counterparty needs to receive something now",
      relayToCounterparty: "natural concise UDC message to the other party, or null",
      newTradeIntake: "boolean",
    },
  });

  try {
    const { content } = await runHermesChat(user, system, 10_000);
    const json = cleanJson(content);
    if (!json) return null;

    const parsed = JSON.parse(json) as Partial<DealConversationDecision>;
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

    if (!replyToSender) return null;

    return {
      intent,
      replyToSender,
      relay,
      relayToCounterparty,
      newTradeIntake: false,
    };
  } catch {
    return null;
  }
}

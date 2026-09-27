import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, dealConversationEventsTable, dealParticipantsTable, dealsTable, documentsTable, usersTable, whatsappMessageContextsTable, whatsappUserContextsTable } from "@workspace/db";
import { buyerRequirementReply } from "../akif/buyerRequirementReply";
import { recordPendingBuyerRequirement } from "../akif/recordBuyerRequirement";
import { recordPendingSellerOffer } from "../akif/recordPendingSellerOffer";
import { sellerOfferReply } from "../akif/sellerOfferReply";
import { queueWhatsAppResearch } from "../akif/queueResearch";
import { isSellerOffer, triageSellerOffer } from "../akif/sellerOfferTriage";
import { triageBuyerRequirement } from "../akif/buyerRequirementTriage";
import { downloadWhatsAppMedia, sendWhatsAppText } from "../whatsapp/client";
import { requireRole } from "../auth/middleware";
import { interpretActiveDealConversation } from "../akif/dealConversationAgent";
import { uploadDocumentBytes } from "../supabase/storage";

const router: IRouter = Router();

function isEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function deliverWhatsAppReply(to: string | undefined, body: string) {
  if (!to) return { delivered: false as const, reason: "missing_sender" as const };

  try {
    return await sendWhatsAppText(to, body);
  } catch (error) {
    return {
      delivered: false as const,
      reason: error instanceof Error ? error.message : "whatsapp_delivery_failed",
    };
  }
}

type ConversationIntent =
  | "acceptance"
  | "rejection"
  | "counteroffer"
  | "document_request"
  | "meeting_request"
  | "counterparty_question"
  | "casual";

function classifyConversationIntent(text: string): ConversationIntent | null {
  const normalized = text.trim().toLowerCase();

  if ([
    /\b(?:i|we)\s+(?:will|would|want to)\s+(?:buy|take|proceed|continue|move ahead|move forward|go forward)\b/,
    /\b(?:i|we)\s+(?:agree|accept|confirm|approve)\b/,
    /\b(?:accepted|agreed|confirmed|go ahead|go forward|move ahead|move forward|continue|proceed|proceed with (?:it|the deal)|buy from them|buy this|lets go forward)\b/,
  ].some((pattern) => pattern.test(normalized))) {
    return "acceptance";
  }

  if ([
    /\b(?:i|we)\s+(?:reject|decline|do not accept|don't accept|will not buy|won't buy)\b/,
    /\b(?:reject|rejected|decline|declined|not interested|cancel the deal)\b/,
  ].some((pattern) => pattern.test(normalized))) {
    return "rejection";
  }

  if ([
    /\b(?:counter|counteroffer|counter offer|make it|lower the price|too expensive|price is too high|can you do)\b/,
    /\b(?:usd|aed|inr|eur)\s*\d[\d,.]*/i,
    /\b\d[\d,.]*\s*(?:usd|aed|inr|eur)\b/i,
  ].some((pattern) => pattern.test(normalized))) {
    return "counteroffer";
  }

  if (/\b(?:send|share|provide|upload|need|require)\b.*\b(?:document|documents|coa|coi|sgs|bl|bill of lading|icpo|loi|fco|sco|spa|proof|certificate)\b/i.test(normalized)) {
    return "document_request";
  }

  if (/\b(?:meet|meeting|call|video call|zoom|teams|appointment)\b/i.test(normalized)) {
    return "meeting_request";
  }

  if (
    /\?$/.test(normalized)
    || /^(?:can|could|will|would|does|do|is|are|when|where|what|how|why)\b/.test(normalized)
  ) {
    return "counterparty_question";
  }

  if (/^(?:ok|okay|fine|sure|yes|no|thanks|thank you|got it|understood|alright|cool|wait|later)[.! ]*$/i.test(normalized)) {
    return "casual";
  }

  return null;
}

function looksLikeNewTradeIntake(text: string) {
  const normalized = text.toLowerCase();
  return /\b\d+(?:\.\d+)?\s*(?:mt|ton|tons|kg|kgs|container|containers)\b/.test(normalized)
    && /\b(?:need|want|buy|supply|sell|offer|deliver|delivered|from|to)\b/.test(normalized);
}

function mediatorCopy(role: string, intent: ConversationIntent, text: string) {
  const party = role === "buyer" ? "buyer" : "seller";

  switch (intent) {
    case "acceptance":
      return role === "buyer"
        ? {
            toSender: "Got it. I’ve recorded that you want to proceed. I’ll confirm the seller’s side and come back to you.",
            toOther: "The buyer has confirmed they want to proceed. I’ll coordinate the next step and let you know what I need from your side.",
            relay: true,
          }
        : {
            toSender: "Got it. I’ve recorded that you’re ready to proceed. I’ll coordinate the next step with the buyer.",
            toOther: "The seller has confirmed they’re ready to proceed. I’ll coordinate the next step and keep you updated.",
            relay: true,
          };
    case "rejection":
      return {
        toSender: "Understood. I’ve recorded that you don’t want to proceed on the current terms. I’ll handle the next step from here.",
        toOther: `The ${party} has decided not to proceed on the current terms. I’ll keep this with UDC and let you know if revised terms are proposed.`,
        relay: true,
      };
    case "counteroffer":
      return {
        toSender: "Got it. I’ve recorded your revised term and I’ll take it to the other side. I’ll come back with their response.",
        toOther: `The ${party} wants to revise the terms: ${text.trim()} Please confirm whether that works, or send your counter.`,
        relay: true,
      };
    case "document_request":
      return {
        toSender: "I’ve noted the document request. I’ll get the relevant document or confirmation from the other side.",
        toOther: `The ${party} needs this for the deal: ${text.trim()} Please send only the relevant document or details when ready.`,
        relay: true,
      };
    case "meeting_request":
      return {
        toSender: "I’ll coordinate the meeting request and come back with the other side’s availability.",
        toOther: `The ${party} would like to arrange a meeting: ${text.trim()} Let me know your available time and I’ll coordinate it.`,
        relay: true,
      };
    case "counterparty_question":
      return {
        toSender: "I’ve got your question. I’ll involve the other side only if their answer is actually needed.",
        toOther: `The ${party} asked: ${text.trim()} Please reply with the information needed for the deal.`,
        relay: true,
      };
    case "casual":
      return {
        toSender: "Got it. I’ve noted that.",
        toOther: null,
        relay: false,
      };
  }
}

async function setActiveDealContext(userId: string, dealId: string) {
  await db.insert(whatsappUserContextsTable)
    .values({ userId, activeDealId: dealId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: whatsappUserContextsTable.userId,
      set: { activeDealId: dealId, updatedAt: new Date() },
    });
}

function inferDocumentType(filename?: string, caption?: string) {
  const value = `${filename ?? ""} ${caption ?? ""}`.toLowerCase();
  if (/\bloi\b|letter of intent/.test(value)) return "LOI";
  if (/\bicpo\b/.test(value)) return "ICPO";
  if (/\bfco\b/.test(value)) return "FCO";
  if (/\bsco\b/.test(value)) return "SCO";
  if (/\bspa\b|sales purchase agreement/.test(value)) return "SPA";
  if (/\bncnda\b/.test(value)) return "NCNDA";
  if (/\bsgs\b/.test(value)) return "SGS";
  if (/bill of lading|\bbl\b/.test(value)) return "BL";
  if (/certificate of origin|\bco\b/.test(value)) return "CO";
  if (/coa|assay/.test(value)) return "COA";
  return "trade_document";
}

async function resolveActiveDealForUser(userId: string) {
  const [saved] = await db
    .select({ activeDealId: whatsappUserContextsTable.activeDealId })
    .from(whatsappUserContextsTable)
    .where(eq(whatsappUserContextsTable.userId, userId))
    .limit(1);

  if (saved) {
    const [participant] = await db
      .select({ dealId: dealParticipantsTable.dealId })
      .from(dealParticipantsTable)
      .where(and(
        eq(dealParticipantsTable.dealId, saved.activeDealId),
        eq(dealParticipantsTable.userId, userId),
        eq(dealParticipantsTable.status, "active"),
      ))
      .limit(1);
    if (participant) return saved.activeDealId;
  }

  const deals = await db
    .select({ dealId: dealParticipantsTable.dealId })
    .from(dealParticipantsTable)
    .innerJoin(dealsTable, eq(dealParticipantsTable.dealId, dealsTable.id))
    .where(and(
      eq(dealParticipantsTable.userId, userId),
      eq(dealParticipantsTable.status, "active"),
      eq(dealsTable.status, "negotiation"),
    ));

  return deals.length === 1 ? deals[0]!.dealId : null;
}

async function handleWhatsAppDealDocument(
  from: string,
  document: { id: string; filename?: string; mime_type?: string; caption?: string },
) {
  const [sender] = await db
    .select({ id: usersTable.id, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.phone, from))
    .limit(1);

  if (!sender || sender.status !== "verified") {
    return { reply: "I received the file, but this WhatsApp account is not verified for UDC deal documents yet." };
  }

  const dealId = await resolveActiveDealForUser(sender.id);
  if (!dealId) {
    return { reply: "I received the file, but I can’t safely tell which active deal it belongs to. Reply to the relevant deal message and send the document again." };
  }

  const media = await downloadWhatsAppMedia(document.id);
  if (media.bytes.byteLength > 25 * 1024 * 1024) {
    return { reply: "I received the document, but it is over the current 25 MB UDC WhatsApp document limit." };
  }

  const safeFilename = (document.filename || "document")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
  const objectPath = `deals/${dealId}/whatsapp/${randomUUID()}-${safeFilename}`;
  const fileUrl = await uploadDocumentBytes(objectPath, media.bytes, media.mimeType);
  const documentType = inferDocumentType(document.filename, document.caption);

  await db.insert(documentsTable).values({
    dealId,
    uploadedBy: sender.id,
    documentType,
    fileUrl,
    status: "pending",
  });

  await setActiveDealContext(sender.id, dealId);
  await db.insert(dealConversationEventsTable).values({
    dealId,
    userId: sender.id,
    participantRole: "document_sender",
    intent: "document_submission",
    originalText: `Uploaded ${documentType}: ${document.filename ?? "document"}${document.caption ? ` — ${document.caption}` : ""}`,
    relayText: null,
    relayed: false,
  });

  return {
    reply: `Got it. I received the ${documentType} and attached it to this deal for review. I won’t treat it as approved or send it onward until the appropriate UDC review step.`,
    dealId,
    recipientUserId: sender.id,
  };
}

async function handleDealWhatsAppMessage(
  from: string,
  text: string,
  replyToProviderMessageId?: string,
) {
  const explicitMatch = text.trim().match(/^deal\s+(UDC-[A-Z0-9-]+)\s*:\s*(.+)$/i);
  const ruleIntent = classifyConversationIntent(text);

  const [sender] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.phone, from))
    .limit(1);

  if (!sender) {
    return explicitMatch || ruleIntent || replyToProviderMessageId
      ? { reply: "I couldn’t link this WhatsApp number to a UDC trade account.", deliveredToCounterparty: false }
      : null;
  }

  if (sender.status !== "verified") {
    return explicitMatch || ruleIntent || replyToProviderMessageId
      ? { reply: "Your UDC account needs to be verified before I can handle deal negotiation.", deliveredToCounterparty: false }
      : null;
  }

  let resolvedDealId: string | null = null;
  let messageBody = text.trim();

  if (replyToProviderMessageId) {
    const [context] = await db
      .select({ dealId: whatsappMessageContextsTable.dealId })
      .from(whatsappMessageContextsTable)
      .where(and(
        eq(whatsappMessageContextsTable.providerMessageId, replyToProviderMessageId),
        eq(whatsappMessageContextsTable.recipientUserId, sender.id),
      ))
      .limit(1);
    if (context) resolvedDealId = context.dealId;
  }

  if (!resolvedDealId && explicitMatch) {
    const dealNumber = explicitMatch[1]!.toUpperCase();
    messageBody = explicitMatch[2]!.trim();
    const [explicitDeal] = await db
      .select({ id: dealsTable.id })
      .from(dealsTable)
      .where(eq(dealsTable.dealNumber, dealNumber))
      .limit(1);

    if (!explicitDeal) {
      return {
        reply: "I couldn’t find that UDC deal. Check the deal number and send it again.",
        deliveredToCounterparty: false,
      };
    }
    resolvedDealId = explicitDeal.id;
  }

  if (!resolvedDealId) {
    const [savedContext] = await db
      .select({ activeDealId: whatsappUserContextsTable.activeDealId })
      .from(whatsappUserContextsTable)
      .where(eq(whatsappUserContextsTable.userId, sender.id))
      .limit(1);

    if (savedContext) {
      const [savedDeal] = await db
        .select({ id: dealsTable.id, status: dealsTable.status })
        .from(dealsTable)
        .where(eq(dealsTable.id, savedContext.activeDealId))
        .limit(1);
      if (savedDeal?.status === "negotiation") resolvedDealId = savedDeal.id;
    }
  }

  if (!resolvedDealId) {
    const activeDeals = await db
      .select({ id: dealsTable.id, dealNumber: dealsTable.dealNumber })
      .from(dealParticipantsTable)
      .innerJoin(dealsTable, eq(dealParticipantsTable.dealId, dealsTable.id))
      .where(and(
        eq(dealParticipantsTable.userId, sender.id),
        eq(dealParticipantsTable.status, "active"),
        eq(dealsTable.status, "negotiation"),
      ));

    if (activeDeals.length === 0) return null;

    if (activeDeals.length > 1) {
      return {
        reply: "You have more than one active negotiation. Reply to the specific UDC deal message so I know which one you mean.",
        deliveredToCounterparty: false,
      };
    }

    resolvedDealId = activeDeals[0]!.id;
  }

  if (!resolvedDealId) return null;

  const [deal] = await db
    .select({
      id: dealsTable.id,
      status: dealsTable.status,
      buyerUserId: dealsTable.buyerUserId,
      sellerUserId: dealsTable.sellerUserId,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, resolvedDealId))
    .limit(1);

  if (!deal) return null;

  if (deal.status !== "negotiation") {
    return {
      reply: `This deal is currently at the ${deal.status} stage. I’ll keep this conversation tied to that stage.`,
      deliveredToCounterparty: false,
      dealId: deal.id,
      recipientUserId: sender.id,
    };
  }

  const [participant] = await db
    .select({ id: dealParticipantsTable.id })
    .from(dealParticipantsTable)
    .where(and(
      eq(dealParticipantsTable.dealId, deal.id),
      eq(dealParticipantsTable.userId, sender.id),
      eq(dealParticipantsTable.status, "active"),
    ))
    .limit(1);

  if (!participant) {
    return { reply: "This WhatsApp account isn’t an active participant in that deal.", deliveredToCounterparty: false };
  }

  const receiverUserId = sender.id === deal.buyerUserId
    ? deal.sellerUserId
    : sender.id === deal.sellerUserId
      ? deal.buyerUserId
      : null;

  if (!receiverUserId) return null;

  await setActiveDealContext(sender.id, deal.id);
  await setActiveDealContext(receiverUserId, deal.id);

  const aiDecision = await interpretActiveDealConversation({
    dealId: deal.id,
    participantRole: sender.role,
    message: messageBody,
  });

  if (aiDecision?.newTradeIntake) {
    return null;
  }

  const effectiveIntent = aiDecision?.intent ?? ruleIntent;
  if (!effectiveIntent) {
    return {
      reply: "I’m following this deal with you, but I’m not fully sure what you mean. Tell me naturally what you want me to do next and I’ll handle it.",
      deliveredToCounterparty: false,
      dealId: deal.id,
      recipientUserId: sender.id,
    };
  }

  const copy = aiDecision
    ? {
        toSender: aiDecision.replyToSender,
        toOther: aiDecision.relayToCounterparty,
        relay: aiDecision.relay,
      }
    : mediatorCopy(sender.role, ruleIntent!, messageBody);

  const [event] = await db.insert(dealConversationEventsTable).values({
    dealId: deal.id,
    userId: sender.id,
    participantRole: sender.role,
    intent: effectiveIntent,
    originalText: messageBody,
    relayText: copy.toOther,
    relayed: false,
  }).returning({ id: dealConversationEventsTable.id });

  let deliveredToCounterparty = false;
  if (copy.relay && copy.toOther) {
    const [receiver] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, receiverUserId))
      .limit(1);

    if (receiver?.phone) {
      const delivery = await deliverWhatsAppReply(receiver.phone, copy.toOther);
      deliveredToCounterparty = delivery.delivered;

      if (delivery.delivered) {
        await db.update(dealConversationEventsTable)
          .set({ relayed: true })
          .where(eq(dealConversationEventsTable.id, event.id));
      }

      if (delivery.delivered && delivery.messageId) {
        await db.insert(whatsappMessageContextsTable)
          .values({
            providerMessageId: delivery.messageId,
            dealId: deal.id,
            recipientUserId: receiverUserId,
            kind: `mediated_${effectiveIntent}`,
          })
          .onConflictDoNothing();
      }
    }
  }

  return {
    reply: copy.toSender,
    deliveredToCounterparty,
    dealId: deal.id,
    recipientUserId: sender.id,
  };
}

router.get(
  "/admin/whatsapp/status",
  requireRole("admin"),
  (_req, res) => {
    const config = {
      appSecretConfigured: Boolean(process.env.WHATSAPP_APP_SECRET),
      webhookVerifyTokenConfigured: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      accessTokenConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberIdConfigured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    };
    const inboundReady = config.appSecretConfigured && config.webhookVerifyTokenConfigured;
    const outboundReady = config.accessTokenConfigured && config.phoneNumberIdConfigured;

    res.json({
      inboundReady,
      outboundReady,
      config,
      webhookPath: "/api/webhooks/whatsapp",
    });
  },
);

router.get("/webhooks/whatsapp", (req, res) => {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!verifyToken || mode !== "subscribe" || typeof token !== "string" || !isEqual(token, verifyToken) || typeof challenge !== "string") {
    res.sendStatus(403);
    return;
  }

  res.type("text/plain").send(challenge);
});

router.post("/webhooks/whatsapp", async (req, res) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const signature = req.header("x-hub-signature-256");
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!appSecret || !signature?.startsWith("sha256=") || !rawBody) {
    res.sendStatus(401);
    return;
  }

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  if (!isEqual(signature, expected)) {
    res.sendStatus(401);
    return;
  }

  const changes = Array.isArray(req.body?.entry)
    ? req.body.entry.flatMap((entry: { changes?: Array<{ value?: { contacts?: Array<{ profile?: { name?: string } }>; messages?: Array<{ id?: string; from?: string; context?: { id?: string }; text?: { body?: string }; document?: { id?: string; filename?: string; mime_type?: string; caption?: string } }> } }> }) => entry.changes ?? [])
    : [];

  for (const change of changes) {
    const value = change.value;
    const fullName = value?.contacts?.[0]?.profile?.name;
    for (const message of value?.messages ?? []) {
      if (message.from && typeof message.document?.id === "string") {
        try {
          const documentResult = await handleWhatsAppDealDocument(message.from, {
            id: message.document.id,
            filename: message.document.filename,
            mime_type: message.document.mime_type,
            caption: message.document.caption,
          });
          const delivery = await deliverWhatsAppReply(message.from, documentResult.reply);
          req.log.info(
            { flow: "deal_document", delivered: delivery.delivered },
            "UDC processed WhatsApp deal document",
          );
        } catch (error) {
          req.log.error(
            { flow: "deal_document", reason: error instanceof Error ? error.message : "document_processing_failed" },
            "UDC could not process WhatsApp deal document",
          );
          await deliverWhatsAppReply(
            message.from,
            "I received the document, but I couldn’t attach it to the deal safely. Please try again in a moment.",
          );
        }
        continue;
      }

      if (typeof message.text?.body !== "string") continue;

      if (message.from) {
        const dealMessage = await handleDealWhatsAppMessage(message.from, message.text.body, message.context?.id);
        if (dealMessage) {
          const delivery = await deliverWhatsAppReply(message.from, dealMessage.reply);
          if (!delivery.delivered) {
            req.log.error(
              { flow: "deal_negotiation", reason: delivery.reason },
              "UDC could not send deal negotiation acknowledgement",
            );
          } else {
            if (delivery.messageId && dealMessage.dealId && dealMessage.recipientUserId) {
              await db.insert(whatsappMessageContextsTable)
                .values({
                  providerMessageId: delivery.messageId,
                  dealId: dealMessage.dealId,
                  recipientUserId: dealMessage.recipientUserId,
                  kind: "mediator_reply",
                })
                .onConflictDoNothing();
            }
            req.log.info(
              { flow: "deal_negotiation", counterpartyDelivered: dealMessage.deliveredToCounterparty },
              "UDC processed mediated WhatsApp deal conversation",
            );
          }
          continue;
        }

        const research = await queueWhatsAppResearch(message.from, message.text.body);
        if (research) {
          const reply =
            `AKIF queued your ${research.intent.direction} research for ${research.intent.product} in ${research.intent.targetCountry}. UDC will keep the research result separate from verification and deal approval.`;
          const delivery = await deliverWhatsAppReply(message.from, reply);
          if (!delivery.delivered) {
            req.log.error(
              { whatsappMessageId: message.id, flow: "akif_research", reason: delivery.reason },
              "AKIF could not send the WhatsApp acknowledgement; check admin WhatsApp configuration",
            );
          } else {
            req.log.info(
              { whatsappMessageId: message.id, flow: "akif_research", researchRunId: research.run.id },
              "AKIF queued WhatsApp research request",
            );
          }
          continue;
        }
      }

      const sellerMessage = isSellerOffer(message.text.body);
      const buyerDraft = sellerMessage ? null : triageBuyerRequirement(message.text.body);
      const sellerDraft = sellerMessage ? triageSellerOffer(message.text.body) : null;
      const record = sellerDraft
        ? sellerDraft.missingFields.length === 0 && message.from && fullName
          ? await recordPendingSellerOffer({
              phone: message.from, fullName, product: sellerDraft.product!, quantity: sellerDraft.quantity!,
              unit: sellerDraft.unit ?? "MT", price: sellerDraft.price!, currency: sellerDraft.currency ?? "USD",
              originCountry: sellerDraft.originCountry, destination: sellerDraft.destination, incoterm: sellerDraft.incoterm,
            })
          : null
        : buyerDraft && buyerDraft.missingFields.length === 0 && message.from && fullName
          ? await recordPendingBuyerRequirement({
              phone: message.from, fullName, product: buyerDraft.product!, quantity: buyerDraft.quantity!,
              unit: buyerDraft.unit ?? "MT", targetPrice: buyerDraft.targetPrice, currency: buyerDraft.currency ?? "USD",
              destination: buyerDraft.destination!, incoterm: buyerDraft.incoterm,
            })
          : null;

      const reply = record
        ? sellerDraft ? "Thanks. UDC recorded your offer for administrator review." : "Thanks. UDC recorded your requirement for administrator review."
        : sellerDraft
          ? sellerOfferReply(sellerDraft)
          : buyerDraft && buyerDraft.missingFields.length === 3
            ? "Hi, I'm AKIF, UDC's trade assistant. I can help with buyer requirements, seller offers, or buyer/seller research. Send a request like: Find buyers for copper cathode in India. To submit a buyer requirement, include product, quantity, and destination."
            : buyerRequirementReply(buyerDraft!);
      const delivery = await deliverWhatsAppReply(message.from, reply);

      if (!delivery.delivered) {
        req.log.error(
          {
            whatsappMessageId: message.id,
            flow: sellerDraft ? "seller_offer" : "buyer_requirement",
            reason: delivery.reason,
          },
          "AKIF could not send the WhatsApp reply; check admin WhatsApp configuration",
        );
      } else {
        req.log.info(
          { whatsappMessageId: message.id, flow: sellerDraft ? "seller_offer" : "buyer_requirement", recordId: record?.id, missingFields: sellerDraft?.missingFields ?? buyerDraft?.missingFields },
          "AKIF processed verified WhatsApp trade message",
        );
      }
    }
  }

  res.sendStatus(200);
});

export default router;

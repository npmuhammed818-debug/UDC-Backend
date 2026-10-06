import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, dealConversationEventsTable, dealParticipantsTable, dealsTable, documentsTable, usersTable, whatsappMessageContextsTable, whatsappUserContextsTable } from "@workspace/db";
import { interpretIntakeConversation } from "../akif/intakeConversation";
import { recordPendingBuyerRequirement } from "../akif/recordBuyerRequirement";
import { recordPendingSellerOffer } from "../akif/recordPendingSellerOffer";
import { queueWhatsAppResearch } from "../akif/queueResearch";
import { isSellerOffer } from "../akif/sellerOfferTriage";
import { downloadWhatsAppMedia, sendWhatsAppDocument, sendWhatsAppText } from "../whatsapp/client";
import { requireRole } from "../auth/middleware";
import { interpretActiveDealConversation } from "../akif/dealConversationAgent";
import { looksLikeNewTradeIntake } from "../akif/dealDecisionSafety";
import { processDocumentIntelligence } from "../akif/documentIntelligence";
import { isOpenAITranscriptionConfigured, transcribeAudio } from "../akif/intelligence/audioTranscription";
import { requestedDealDocumentDeliveryTarget } from "../akif/dealDocumentRouting";
import { createSignedDownloadUrl, parseStoragePath, uploadDocumentBytes } from "../supabase/storage";
import { mergeBuyerRequirementDraft, mergeSellerOfferDraft } from "../akif/intakeDraftMerge";
import { clearWhatsAppIntakeDraft, loadWhatsAppIntakeDraft, saveWhatsAppIntakeDraft } from "../akif/whatsappIntakeStore";

import { whatsappPrivacyGate } from "../privacy/whatsappPrivacyGate";

const router: IRouter = Router();

function isEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function cleanHumanWhatsAppText(body: string) {
  return body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/_{2,}/g, " ")
    .replace(/;{1,}/g, ".")
    .replace(/"{2,}/g, "")
    .replace(/'{3,}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([!?.,])\1{1,}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function deliverWhatsAppReply(to: string | undefined, body: string) {
  if (!to) return { delivered: false as const, reason: "missing_sender" as const };

  try {
    return await sendWhatsAppText(to, cleanHumanWhatsAppText(body));
  } catch {
    return {
      delivered: false as const,
      // Provider errors must not be copied into logs: they can contain user or
      // provider data. The WhatsApp client already records only safe status/code
      // metadata before it throws.
      reason: "whatsapp_delivery_failed" as const,
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


function mediatorCopy(_role: string, intent: ConversationIntent, text: string) {
  switch (intent) {
    case "acceptance":
      return {
        toSender: "Perfect. I’ll move it forward from here.",
        toOther: "Perfect, we’re aligned on those terms. I’ll move this to the next step.",
        relay: true,
      };
    case "rejection":
      return {
        toSender: "No problem. Send me what would work for you and I’ll take it from there.",
        toOther: "That won’t work as it stands. What’s your best revised offer?",
        relay: true,
      };
    case "counteroffer":
      return {
        toSender: "Got it. I’ll check that and come back to you.",
        toOther: `${text.trim()} If that doesn’t work, send me your best.`,
        relay: true,
      };
    case "document_request":
      return {
        toSender: "Sure, I’ll sort that.",
        toOther: "Can you send that document over?",
        relay: true,
      };
    case "meeting_request":
      return {
        toSender: "Sure. I’ll set it up and get back to you.",
        toOther: `${text.trim()} What time works for you?`,
        relay: true,
      };
    case "counterparty_question":
      return {
        toSender: "I’ll check and come back to you.",
        toOther: `${text.trim()} Can you clarify that for me?`,
        relay: true,
      };
    case "casual":
      return {
        toSender: "Got it.",
        toOther: null,
        relay: false,
      };
  }
}

function parseExplicitCommercialTerms(text: string) {
  const quantityMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(MT|TONS?|KG|KGS?|CONTAINERS?)\b/i);
  const usdPriceMatch = text.match(/(?:\$|USD\s*)([\d,]+(?:\.\d+)?)\s*(?:\/\s*(?:MT|TON|KG)|PER\s+(?:MT|TON|KG))?/i);
  const otherPriceMatch = text.match(/\b(AED|INR|EUR)\s*([\d,]+(?:\.\d+)?)\b/i);

  const quantity = quantityMatch ? Number(quantityMatch[1]) : undefined;
  const rawUnit = quantityMatch?.[2]?.toUpperCase();
  const unit = rawUnit
    ? /^(?:MT|TON|TONS)$/.test(rawUnit)
      ? "MT"
      : /^(?:KG|KGS)$/.test(rawUnit)
        ? "KG"
        : "container"
    : undefined;

  const price = usdPriceMatch
    ? Number(usdPriceMatch[1]!.replace(/,/g, ""))
    : otherPriceMatch
      ? Number(otherPriceMatch[2]!.replace(/,/g, ""))
      : undefined;
  const currency = usdPriceMatch
    ? "USD"
    : otherPriceMatch?.[1]?.toUpperCase();

  return {
    quantity: Number.isFinite(quantity) ? quantity : undefined,
    unit,
    price: Number.isFinite(price) ? price : undefined,
    currency,
  };
}

async function exactCounterofferForReply(dealId: string, replyContextKind?: string) {
  const prefix = "mediated_counteroffer:";
  if (!replyContextKind?.startsWith(prefix)) return null;

  const eventId = replyContextKind.slice(prefix.length);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;

  const [event] = await db
    .select({
      id: dealConversationEventsTable.id,
      participantRole: dealConversationEventsTable.participantRole,
      originalText: dealConversationEventsTable.originalText,
      relayText: dealConversationEventsTable.relayText,
      relayed: dealConversationEventsTable.relayed,
    })
    .from(dealConversationEventsTable)
    .where(and(
      eq(dealConversationEventsTable.id, eventId),
      eq(dealConversationEventsTable.dealId, dealId),
      eq(dealConversationEventsTable.intent, "counteroffer"),
      eq(dealConversationEventsTable.relayed, true),
    ))
    .limit(1);

  return event ?? null;
}

async function applyAcceptedCounterofferToDeal(dealId: string, eventText: string) {
  const terms = parseExplicitCommercialTerms(eventText);
  if (terms.quantity === undefined && terms.price === undefined) return;

  const [current] = await db
    .select({
      quantity: dealsTable.quantity,
      unit: dealsTable.unit,
      agreedPrice: dealsTable.agreedPrice,
      currency: dealsTable.currency,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, dealId))
    .limit(1);
  if (!current) return;

  const quantity = terms.quantity ?? Number(current.quantity);
  const price = terms.price ?? Number(current.agreedPrice);
  const currency = terms.currency ?? current.currency;

  await db.update(dealsTable)
    .set({
      ...(terms.quantity !== undefined ? { quantity: String(terms.quantity), unit: terms.unit ?? current.unit } : {}),
      ...(terms.price !== undefined ? { agreedPrice: String(terms.price), currency } : {}),
      dealValue: Number.isFinite(quantity) && Number.isFinite(price)
        ? String(quantity * price)
        : undefined,
      updatedAt: new Date(),
    })
    .where(eq(dealsTable.id, dealId));
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

function requestedStoredDocumentType(text: string, replyContextKind?: string) {
  const normalized = text.trim().toLowerCase();
  const explicit = [
    ["LOI", /\bloi\b|letter of intent/],
    ["ICPO", /\bicpo\b/],
    ["FCO", /\bfco\b/],
    ["SCO", /\bsco\b/],
    ["SPA", /\bspa\b|sales purchase agreement/],
    ["NCNDA", /\bncnda\b/],
    ["SGS", /\bsgs\b/],
    ["BL", /bill of lading|\bbl\b/],
    ["COA", /\bcoa\b|assay/],
    ["CO", /certificate of origin/],
  ] as const;

  const requested = explicit.find(([, pattern]) => pattern.test(normalized))?.[0];
  if (requested && /\b(?:send|share|show|get|where|whr)\b/.test(normalized)) {
    return requested;
  }

  if (
    replyContextKind?.includes("document_request")
    && /^(?:send(?: it)?(?: to me)?|share it|show me|where is it|whr is it|(?:to|for)\s+(?:the\s+)?(?:buyer|seller|him|her|them|other side|other party))[.! ]*$/i.test(normalized)
  ) {
    return "LATEST";
  }

  return null;
}

async function latestStoredDealDocument(dealId: string, documentType: string) {
  const condition = documentType === "LATEST"
    ? eq(documentsTable.dealId, dealId)
    : and(
        eq(documentsTable.dealId, dealId),
        eq(documentsTable.documentType, documentType),
      );

  const [document] = await db
    .select({
      documentType: documentsTable.documentType,
      fileUrl: documentsTable.fileUrl,
      createdAt: documentsTable.createdAt,
    })
    .from(documentsTable)
    .where(condition)
    .orderBy(desc(documentsTable.createdAt))
    .limit(1);

  return document ?? null;
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
  inboundProviderMessageId?: string,
) {
  const [sender] = await db
    .select({ id: usersTable.id, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.phone, from))
    .limit(1);

  if (!sender || sender.status !== "verified") {
    return { reply: "I got the file, but this number isn’t verified for UDC documents yet." };
  }

  const dealId = await resolveActiveDealForUser(sender.id);
  if (!dealId) {
    return { reply: "I got the file, but I’m not sure which deal it belongs to. Reply to the right deal message and send it again." };
  }

  if (inboundProviderMessageId) {
    const [claim] = await db.insert(whatsappMessageContextsTable)
      .values({
        providerMessageId: inboundProviderMessageId,
        dealId,
        recipientUserId: sender.id,
        kind: "inbound_document_processing",
      })
      .onConflictDoNothing()
      .returning({ id: whatsappMessageContextsTable.id });

    if (!claim) {
      return { duplicate: true as const, reply: "" };
    }
  }

  const media = await downloadWhatsAppMedia(document.id);
  if (media.bytes.byteLength > 25 * 1024 * 1024) {
    return { reply: "That file is over the 25 MB limit. Send a smaller copy and I’ll take it from there." };
  }

  const safeFilename = (document.filename || "document")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
  const objectPath = `deals/${dealId}/whatsapp/${randomUUID()}-${safeFilename}`;
  const fileUrl = await uploadDocumentBytes(objectPath, media.bytes, media.mimeType);
  const documentType = inferDocumentType(document.filename, document.caption);

  const [savedDocument] = await db.insert(documentsTable).values({
    dealId,
    uploadedBy: sender.id,
    documentType,
    fileUrl,
    status: "pending",
  }).returning({ id: documentsTable.id });

  if (!savedDocument) {
    throw new Error("document_record_not_created");
  }

  void processDocumentIntelligence({
    documentId: savedDocument.id,
    dealId,
    documentType,
    bytes: media.bytes,
    fileName: document.filename ?? "document",
    mimeType: media.mimeType,
  })
    .then(async (result) => {
      const warning = result.status === "needs_review"
        ? " I extracted the available text, but this file may contain scanned/image-only pages, so manual review is still required."
        : "";
      await sendWhatsAppText(
        from,
        `I finished extracting the ${documentType}. Its full text and structured trade data are now saved in this deal.${warning}`,
      ).catch(() => undefined);
    })
    .catch(async () => {
      await sendWhatsAppText(
        from,
        `I attached the ${documentType} to the deal, but full extraction failed. UDC kept the original file for review and retry.`,
      ).catch(() => undefined);
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
    reply: `Got the ${documentType}. I’ll keep it here for review.`,
    dealId,
    recipientUserId: sender.id,
  };
}

async function handleDealWhatsAppMessage(
  from: string,
  text: string,
  replyToProviderMessageId?: string,
  inboundProviderMessageId?: string,
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
      ? { reply: "I don’t recognize this number yet. Make sure it’s linked to your UDC account.", deliveredToCounterparty: false }
      : null;
  }

  if (sender.status !== "verified") {
    return explicitMatch || ruleIntent || replyToProviderMessageId
      ? { reply: "I need your UDC account verified before I can handle this deal.", deliveredToCounterparty: false }
      : null;
  }

  let resolvedDealId: string | null = null;
  let replyContextKind: string | undefined;
  let messageBody = text.trim();

  if (replyToProviderMessageId) {
    const [context] = await db
      .select({
        dealId: whatsappMessageContextsTable.dealId,
        kind: whatsappMessageContextsTable.kind,
      })
      .from(whatsappMessageContextsTable)
      .where(and(
        eq(whatsappMessageContextsTable.providerMessageId, replyToProviderMessageId),
        eq(whatsappMessageContextsTable.recipientUserId, sender.id),
      ))
      .limit(1);
    if (context) {
      resolvedDealId = context.dealId;
      replyContextKind = context.kind;
    }
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
      if (savedDeal) resolvedDealId = savedDeal.id;
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
      ));

    if (activeDeals.length === 0) return null;

    if (activeDeals.length > 1) {
      return {
        reply: "You’ve got more than one deal open. Reply to the deal message you mean.",
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
      quantity: dealsTable.quantity,
      unit: dealsTable.unit,
      agreedPrice: dealsTable.agreedPrice,
      currency: dealsTable.currency,
      incoterm: dealsTable.incoterm,
      destination: dealsTable.destination,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, resolvedDealId))
    .limit(1);

  if (!deal) return null;

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
    return { reply: "I can’t match this number to that deal.", deliveredToCounterparty: false };
  }

  const receiverUserId = sender.id === deal.buyerUserId
    ? deal.sellerUserId
    : sender.id === deal.sellerUserId
      ? deal.buyerUserId
      : null;

  if (!receiverUserId) return null;

  // Meta can retry the same webhook when an AI turn is slow. Claim the inbound
  // provider message id before any model call so the same commercial message
  // cannot be interpreted or relayed twice.
  if (inboundProviderMessageId) {
    const [claim] = await db.insert(whatsappMessageContextsTable)
      .values({
        providerMessageId: inboundProviderMessageId,
        dealId: deal.id,
        recipientUserId: sender.id,
        kind: "inbound_processing",
      })
      .onConflictDoNothing()
      .returning({ id: whatsappMessageContextsTable.id });

    if (!claim) {
      return {
        duplicate: true,
        reply: "",
        deliveredToCounterparty: false,
        dealId: deal.id,
        recipientUserId: sender.id,
      };
    }
  }

  await setActiveDealContext(sender.id, deal.id);
  await setActiveDealContext(receiverUserId, deal.id);

  const requestedDocument = requestedStoredDocumentType(messageBody, replyContextKind);
  if (requestedDocument) {
    const deliveryTarget = requestedDealDocumentDeliveryTarget(messageBody, sender.role);
    const storedDocument = await latestStoredDealDocument(deal.id, requestedDocument);

    if (storedDocument) {
      const storageObjectPath = parseStoragePath(storedDocument.fileUrl);
      if (storageObjectPath) {
        const extension = storageObjectPath.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "pdf";

        if (deliveryTarget === "counterparty") {
          const [receiver] = await db
            .select({ phone: usersTable.phone })
            .from(usersTable)
            .where(eq(usersTable.id, receiverUserId))
            .limit(1);

          if (!receiver?.phone) {
            return {
              reply: `I’ve got the ${storedDocument.documentType}, but it didn’t send. I’ll keep it here for now.`,
              deliveredToCounterparty: false,
              dealId: deal.id,
              recipientUserId: sender.id,
              contextKind: "mediator_reply_document_delivery_failed",
            };
          }

          let documentDelivered = false;
          let documentMessageId: string | undefined;
          try {
            const signedUrl = await createSignedDownloadUrl(storageObjectPath);
            const documentDelivery = await sendWhatsAppDocument(
              receiver.phone,
              signedUrl,
              `${storedDocument.documentType}.${extension}`,
              `${storedDocument.documentType} for review. Let me know what you want to do next.`,
            );
            documentDelivered = documentDelivery.delivered;
            documentMessageId = "messageId" in documentDelivery
              ? documentDelivery.messageId
              : undefined;
          } catch {
            documentDelivered = false;
          }

          if (documentDelivered && documentMessageId) {
            await db.insert(whatsappMessageContextsTable)
              .values({
                providerMessageId: documentMessageId,
                dealId: deal.id,
                recipientUserId: receiverUserId,
                kind: `deal_document_${storedDocument.documentType.toLowerCase()}`,
              })
              .onConflictDoNothing();
          }

          return {
            reply: documentDelivered
              ? `Done. I sent the ${storedDocument.documentType}.`
              : `I’ve got the ${storedDocument.documentType}, but it didn’t send. I’ll keep it here for now.`,
            deliveredToCounterparty: documentDelivered,
            dealId: deal.id,
            recipientUserId: sender.id,
            contextKind: documentDelivered
              ? "mediator_reply_document_forwarded"
              : "mediator_reply_document_delivery_failed",
          };
        }

        return {
          reply: `Got it. Sending the ${storedDocument.documentType} now.`,
          deliveredToCounterparty: false,
          dealId: deal.id,
          recipientUserId: sender.id,
          contextKind: "mediator_reply_document_delivery",
          documentToSender: {
            documentType: storedDocument.documentType,
            storageObjectPath,
            fileName: `${storedDocument.documentType}.${extension}`,
          },
        };
      }
    }

    if (deliveryTarget === "counterparty") {
      const label = requestedDocument === "LATEST" ? "requested document" : requestedDocument;
      return {
        reply: `I don’t have the ${label} yet. Send it here and I’ll pass it on.`,
        deliveredToCounterparty: false,
        dealId: deal.id,
        recipientUserId: sender.id,
        contextKind: "mediator_reply_document_missing",
      };
    }
  }

  const aiDecision = await interpretActiveDealConversation({
    dealId: deal.id,
    participantRole: sender.role,
    message: messageBody,
    replyContextKind,
  });

  if (aiDecision?.newTradeIntake && looksLikeNewTradeIntake(messageBody)) {
    return null;
  }

  // A keyword match cannot safely interpret a trade negotiation. In particular,
  // it may turn a question into an acceptance or forward confidential wording.
  if (!aiDecision) {
    await db.insert(dealConversationEventsTable).values({
      dealId: deal.id,
      userId: sender.id,
      participantRole: sender.role,
      intent: "unprocessed",
      originalText: messageBody,
      relayText: null,
      relayed: false,
    });
    return {
      reply: "I couldn’t process that properly, so I haven’t passed anything on.",
      deliveredToCounterparty: false,
      dealId: deal.id,
      recipientUserId: sender.id,
      contextKind: "mediator_reply_unprocessed",
    };
  }

  const effectiveIntent = aiDecision.intent;
  const exactCounteroffer = ["acceptance", "rejection"].includes(effectiveIntent)
    ? await exactCounterofferForReply(deal.id, replyContextKind)
    : null;

  const copy = {
    toSender: aiDecision.replyToSender,
    toOther: aiDecision.relayToCounterparty,
    relay: aiDecision.relay,
  };

  if (deal.status === "negotiation" && exactCounteroffer && effectiveIntent === "acceptance") {
    await applyAcceptedCounterofferToDeal(
      deal.id,
      exactCounteroffer.relayText ?? "",
    );
  }

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
            kind: `mediated_${effectiveIntent}:${event.id}`,
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
    contextKind: `mediator_reply_${effectiveIntent}:${event.id}`,
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
    ? req.body.entry.flatMap((entry: { changes?: Array<{ value?: { contacts?: Array<{ profile?: { name?: string } }>; messages?: Array<{ id?: string; from?: string; context?: { id?: string }; text?: { body?: string }; audio?: { id?: string; mime_type?: string; voice?: boolean }; document?: { id?: string; filename?: string; mime_type?: string; caption?: string } }> } }> }) => entry.changes ?? [])
    : [];

  for (const change of changes) {
    const value = change.value;
    const fullName = value?.contacts?.[0]?.profile?.name;
    for (const message of value?.messages ?? []) {
      if (message.from && (typeof message.text?.body === "string" || typeof message.document?.id === "string" || typeof message.audio?.id === "string")) {
        try {
          const privacyReply = await whatsappPrivacyGate(message.from, message.text?.body);
          if (privacyReply) { await deliverWhatsAppReply(message.from, privacyReply); continue; }
        } catch {
          req.log.error({ flow: "privacy_consent", reason: "consent_check_failed" }, "UDC privacy check unavailable");
          await deliverWhatsAppReply(message.from, "I couldn’t check your privacy preferences. Please try again shortly.");
          continue;
        }
      }
      if (message.from && typeof message.audio?.id === "string") {
        if (!isOpenAITranscriptionConfigured()) {
          await deliverWhatsAppReply(
            message.from,
            "I can receive voice notes, but voice transcription isn’t connected yet. Please send this one as text for now.",
          );
          continue;
        }

        try {
          const audio = await downloadWhatsAppMedia(message.audio.id);
          if (!audio.mimeType.startsWith("audio/")) {
            await deliverWhatsAppReply(message.from, "That audio format didn’t come through correctly. Please resend the voice note.");
            continue;
          }
          const transcript = await transcribeAudio(audio.bytes, audio.mimeType);
          message.text = { body: transcript };
          req.log.info(
            { whatsappMessageId: message.id, flow: "voice_note" },
            "UDC transcribed WhatsApp voice note",
          );
        } catch (error) {
          req.log.error(
            {
              whatsappMessageId: message.id,
              flow: "voice_note",
              errorName: error instanceof Error ? error.name : "UnknownError",
              reason: "voice_transcription_failed",
            },
            "UDC could not transcribe WhatsApp voice note",
          );
          await deliverWhatsAppReply(
            message.from,
            "I couldn’t understand that voice note clearly. Please resend it or type the message.",
          );
          continue;
        }
      }

      if (message.from && typeof message.document?.id === "string") {
        try {
          const documentResult = await handleWhatsAppDealDocument(
            message.from,
            {
              id: message.document.id,
              filename: message.document.filename,
              mime_type: message.document.mime_type,
              caption: message.document.caption,
            },
            message.id,
          );
          if ("duplicate" in documentResult && documentResult.duplicate) {
            req.log.info(
              { whatsappMessageId: message.id, flow: "deal_document" },
              "UDC ignored duplicate WhatsApp deal document",
            );
            continue;
          }
          const delivery = await deliverWhatsAppReply(message.from, documentResult.reply);
          req.log.info(
            { flow: "deal_document", delivered: delivery.delivered },
            "UDC processed WhatsApp deal document",
          );
        } catch (error) {
          req.log.error(
            {
              flow: "deal_document",
              errorName: error instanceof Error ? error.name : "UnknownError",
              reason: "document_processing_failed",
            },
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

      const pendingIntake = message.from
        ? await loadWhatsAppIntakeDraft(message.from)
        : null;
      const hasPendingIntake = Boolean(
        pendingIntake
        && !pendingIntake.stale
        && !pendingIntake.draft.submittedRecordId
        && Boolean(pendingIntake.draft.product || pendingIntake.draft.quantity),
      );

      if (
        message.from
        && hasPendingIntake
        && /^(?:cancel|cancel it|forget it|leave it|drop it|back to (?:the )?deal)[.! ]*$/i.test(message.text.body.trim())
      ) {
        await clearWhatsAppIntakeDraft({
          phone: message.from,
          role: pendingIntake!.role as "buyer" | "seller",
          fullName: pendingIntake?.fullName ?? undefined,
          providerMessageId: message.id,
        });
        await deliverWhatsAppReply(message.from, "Sure. I dropped that request.");
        continue;
      }

      if (message.from && !hasPendingIntake) {
        const dealMessage = await handleDealWhatsAppMessage(
          message.from,
          message.text.body,
          message.context?.id,
          message.id,
        );
        if (dealMessage) {
          if ("duplicate" in dealMessage && dealMessage.duplicate) {
            req.log.info(
              { whatsappMessageId: message.id, flow: "deal_negotiation" },
              "UDC ignored duplicate WhatsApp deal message",
            );
            continue;
          }

          if ("documentToSender" in dealMessage && dealMessage.documentToSender) {
            let documentDelivered = false;
            let documentMessageId: string | undefined;

            try {
              const signedUrl = await createSignedDownloadUrl(dealMessage.documentToSender.storageObjectPath);
              const documentDelivery = await sendWhatsAppDocument(
                message.from,
                signedUrl,
                dealMessage.documentToSender.fileName,
                `UDC ${dealMessage.documentToSender.documentType} document`,
              );
              documentDelivered = documentDelivery.delivered;
              documentMessageId = "messageId" in documentDelivery
                ? documentDelivery.messageId
                : undefined;
            } catch {
              documentDelivered = false;
            }

            const replyBody = documentDelivered
              ? `Sent the ${dealMessage.documentToSender.documentType}.`
              : `I’ve got the ${dealMessage.documentToSender.documentType}, but it didn’t send. I’ll keep it here for now.`;
            const delivery = await deliverWhatsAppReply(message.from, replyBody);

            if (documentDelivered && documentMessageId && dealMessage.dealId && dealMessage.recipientUserId) {
              await db.insert(whatsappMessageContextsTable)
                .values({
                  providerMessageId: documentMessageId,
                  dealId: dealMessage.dealId,
                  recipientUserId: dealMessage.recipientUserId,
                  kind: `deal_document_${dealMessage.documentToSender.documentType.toLowerCase()}`,
                })
                .onConflictDoNothing();
            }

            req.log.info(
              {
                flow: "deal_document_delivery",
                delivered: documentDelivered,
                acknowledgementDelivered: delivery.delivered,
              },
              "UDC handled stored WhatsApp deal document request",
            );
            continue;
          }

          const delivery = await deliverWhatsAppReply(message.from, dealMessage.reply);
          if (!delivery.delivered) {
            req.log.error(
              { flow: "deal_negotiation", reason: delivery.reason },
              "UDC could not send deal negotiation acknowledgement",
            );
          } else {
            if (dealMessage.dealId && dealMessage.recipientUserId) {
              await db.insert(dealConversationEventsTable).values({
                dealId: dealMessage.dealId,
                userId: dealMessage.recipientUserId,
                participantRole: "udc",
                intent: "coordinator_reply",
                originalText: dealMessage.reply,
                relayed: false,
              });
            }
            if (delivery.messageId && dealMessage.dealId && dealMessage.recipientUserId) {
              await db.insert(whatsappMessageContextsTable)
                .values({
                  providerMessageId: delivery.messageId,
                  dealId: dealMessage.dealId,
                  recipientUserId: dealMessage.recipientUserId,
                  kind: "contextKind" in dealMessage && typeof dealMessage.contextKind === "string"
                    ? dealMessage.contextKind
                    : "mediator_reply",
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
            `Sure. I’ll look for ${research.intent.direction === "buyer" ? "buyers" : "sellers"} for ${research.intent.product} in ${research.intent.targetCountry} and come back with what I find.`;
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

      const savedIntake = pendingIntake;

      if (
        message.id
        && savedIntake?.lastProviderMessageId
        && savedIntake.lastProviderMessageId === message.id
      ) {
        req.log.info(
          { whatsappMessageId: message.id, flow: "trade_intake" },
          "UDC ignored duplicate WhatsApp intake message",
        );
        continue;
      }

      const hasSavedDraft = Boolean(
        savedIntake
        && !savedIntake.stale
        && Object.keys(savedIntake.draft ?? {}).length > 0,
      );
      const intakeDecision = await interpretIntakeConversation({
        message: message.text.body,
        role: isSellerOffer(message.text.body) ? "seller" : savedIntake?.role === "seller" ? "seller" : "buyer",
        memory: hasSavedDraft ? savedIntake!.draft : null,
      });
      if (!intakeDecision) {
        await deliverWhatsAppReply(message.from, "I couldn’t process that just now. Please try again shortly.");
        continue;
      }
      const intakeRole = intakeDecision.role;
      const previousDraft = !intakeDecision.newIntake && savedIntake?.role === intakeRole
        ? savedIntake.draft : null;

      const contactName =
        fullName?.trim()
        || savedIntake?.fullName?.trim()
        || "WhatsApp User";

      const buyerDraft = intakeRole === "buyer"
        ? mergeBuyerRequirementDraft(previousDraft, { ...intakeDecision.fields, missingFields: [] }, "")
        : null;
      const sellerDraft = intakeRole === "seller"
        ? mergeSellerOfferDraft(previousDraft, { ...intakeDecision.fields, missingFields: [] })
        : null;

      const record = previousDraft?.submittedRecordId ? null : sellerDraft
        ? sellerDraft.missingFields.length === 0 && message.from
          ? await recordPendingSellerOffer({
              phone: message.from,
              fullName: contactName,
              product: sellerDraft.product!,
              quantity: sellerDraft.quantity!,
              unit: sellerDraft.unit ?? "MT",
              price: sellerDraft.price!,
              currency: sellerDraft.currency ?? "USD",
              originCountry: sellerDraft.originCountry,
              destination: sellerDraft.destination,
              incoterm: sellerDraft.incoterm,
            })
          : null
        : buyerDraft && buyerDraft.missingFields.length === 0 && message.from
          ? await recordPendingBuyerRequirement({
              phone: message.from,
              fullName: contactName,
              product: buyerDraft.product!,
              quantity: buyerDraft.quantity!,
              unit: buyerDraft.unit ?? "MT",
              targetPrice: buyerDraft.targetPrice,
              currency: buyerDraft.currency ?? "USD",
              destination: buyerDraft.destination!,
              incoterm: buyerDraft.incoterm,
            })
          : null;

      if (message.from) {
        const draftForStorage = sellerDraft
          ? {
              product: sellerDraft.product,
              quantity: sellerDraft.quantity,
              unit: sellerDraft.unit,
              price: sellerDraft.price,
              currency: sellerDraft.currency,
              originCountry: sellerDraft.originCountry,
              destination: sellerDraft.destination,
              incoterm: sellerDraft.incoterm,
            }
          : {
              product: buyerDraft?.product,
              quantity: buyerDraft?.quantity,
              unit: buyerDraft?.unit,
              targetPrice: buyerDraft?.targetPrice,
              currency: buyerDraft?.currency,
              destination: buyerDraft?.destination,
              incoterm: buyerDraft?.incoterm,
            };

        await saveWhatsAppIntakeDraft({
          phone: message.from,
          role: intakeRole,
          fullName: contactName,
          draft: {
            ...draftForStorage,
            submittedRecordId: record?.id ?? previousDraft?.submittedRecordId,
            conversation: [...(previousDraft?.conversation ?? []), {
              message: message.text.body, reply: intakeDecision.reply,
            }].slice(-12),
          },
          providerMessageId: message.id,
        });
      }

      const reply = intakeDecision.reply;
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

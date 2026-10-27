import { SUPPORT_EMAIL } from '../privacy/policies';
import { handleEmailVerification } from '../whatsapp/emailVerification';
import { handlePhoneRecovery } from '../whatsapp/phoneRecovery';
import {recordSignedShipmentStatuses} from '../whatsapp/shipmentDeliveryReceipts';
import {recordSignedCustomerInbound} from '../whatsapp/customerServiceWindow';
import { answerGuidance, isGuidanceQuestion } from '../whatsapp/guidance';
import { recordedDealTerms } from '../deals/recordedTerms';
import { chatAction, handleChatUi, sendChatHome, type ChatMessage } from '../whatsapp/chatUi';
import { isAgentRegistrationRequest, registerWhatsAppAgent } from "../akif/agentRegistration";
import { handleWhatsAppSignin, parseSigninCommand } from '../auth/whatsappSignin';
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { claimInboundMessage, completeInboundMessages, releaseInboundMessages } from "../whatsapp/inboundDedup";
import { checkInboundCap, INBOUND_CAP_NOTICE } from "../whatsapp/inboundRateCap";
import { trackReplyFailures, markReadAndTyping } from "../whatsapp/client";
import { replySinkEnabled, sinkReadAuthorized, readSunkReplies } from "../whatsapp/replySink";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, auditLogsTable, productsTable, dealConversationEventsTable, dealParticipantsTable, dealsTable, documentAccessTable, documentsTable, companiesTable, usersTable, whatsappMessageContextsTable, whatsappUserContextsTable } from "@workspace/db";
import { interpretIntakeConversation } from "../akif/intakeConversation";
import { recordPendingBuyerRequirement } from "../akif/recordBuyerRequirement";
import { recordPendingSellerOffer } from "../akif/recordPendingSellerOffer";
import { isAkifWorkerMediaEnabled, transcribeAkifAudioDetailed } from "../akif/intelligence/workerClient";
import { queueWhatsAppResearch } from "../akif/queueResearch";
import { isSellerOffer } from "../akif/sellerOfferTriage";
import { AADHAAR_REFUSAL, containsAadhaarNumber, mentionsAadhaarDocument } from "../privacy/aadhaar";
import { acknowledgementReply, grievanceDeadline, isGrievance } from "../grievance/grievance";
import { scrubAadhaar } from "../privacy/aadhaar";
import { guidedChatPhoneHash } from "../whatsapp/phoneFingerprint";
import { react, reactByMeaning } from "../whatsapp/reactions";
import { speakReply } from "../whatsapp/voiceSend";
import { parseVoiceCommand, setTextOnly, getVoiceState, TEXT_ONLY_CONFIRMATION, VOICE_ON_CONFIRMATION } from "../whatsapp/voicePreference";
import { VOICE_NOTICE, VOICE_TEXT_OFFER, EXPLICIT_VOICE_CONFIRMATION, EXPLICIT_VOICE_TEXT_ONLY, parseVoiceRequest, isOfferYes } from "../akif/voiceConsent.ts";
import { armExplicitVoice, consumeExplicitVoice, setVoiceOffer, takeVoiceOffer, textOfferSeconds } from "../akif/voiceSession.ts";
import { voiceRepliesEnabled } from "../akif/voiceReply.ts";
import { reserveTranscription } from "../akif/voiceLimits.ts";
import { downloadWhatsAppMedia, sendWhatsAppDocument, sendWhatsAppText, sendWhatsAppTextWithMenu } from "../whatsapp/client";
import { requireRole } from "../auth/middleware";
import { interpretActiveDealConversation } from "../akif/dealConversationAgent";
import { looksLikeNewTradeIntake, isExplicitSeparateTradeIntake, isStandaloneBuyerInquiry } from "../akif/dealDecisionSafety";
import { processDocumentIntelligence } from "../akif/documentIntelligence";
import { requestedDealDocumentDeliveryTarget } from "../akif/dealDocumentRouting";
import { createSignedDownloadUrl, parseStoragePath, uploadDocumentBytes } from "../supabase/storage";
import { managedDealDocumentPath } from "../supabase/documentAccessPath";
import { looksLikeConfidentialDocumentTopic, SENSITIVE_UPLOAD_WARNING, vaultRedirectReply, VAULT_DOCUMENT_TYPES, type VaultDocumentType } from "../vault/uploadLink";
import { wantsHumanHelp, HUMAN_HANDOFF_REPLY } from "../akif/conversationPolicy";
import { getVaultLinkIssuer } from "../vault/issuer";
import { mergeBuyerRequirementDraft, mergeSellerOfferDraft } from "../akif/intakeDraftMerge";
import { sellerOfferReply } from "../akif/sellerOfferReply";
import { triageSellerOffer } from "../akif/sellerOfferTriage";
import { clearWhatsAppIntakeDraft, loadWhatsAppIntakeDraft, saveWhatsAppIntakeDraft } from "../akif/whatsappIntakeStore";

import { whatsappPrivacyGate } from "../privacy/whatsappPrivacyGate";
import { askedAboutPausingDeal, dealPauseHowTo } from "../deals/dealPauseText";
import { requestedDealPause, dealPauseContextKind, dealPausePrompt, applyDealPause, pausedConfirmationToSender, closedConfirmationToSender } from "../deals/dealPause";
import { requestedWhatsAppDraft, mayPrepareWhatsAppDraft, whatsappDraftConfirmation, generateWhatsAppDraftPdf } from "../deals/whatsappDraft";
import type { SpaDraftInput } from "../deals/spaDraft";

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

const VOICE_LANGUAGE_NAMES: Record<string, string> = { eng: "english", mal: "malayalam", tam: "tamil", hin: "hindi", ara: "arabic" };

/**
 * Reply the way a person would: voice only when the user used voice (or asked for it) and the reply is warm or
 * explanatory. Exact details, links, codes and anything unsure go as text. A spoken reply is never also sent as
 * text. If the voice cannot be sent, the same reply goes as text. After a long voice reply (over the threshold)
 * a short text offer follows; the text itself is only sent after a yes.
 */
async function deliverAnswer(to: string, reply: string, wantsVoice: boolean) {
  if (!wantsVoice) return deliverWhatsAppReply(to, reply);
  const spoken = await speakReply(to, reply);
  if (spoken.status === false) return deliverWhatsAppReply(to, reply);
  if (spoken.status === "uncertain") return { delivered: false as const, reason: "provider_outcome_unknown" as const };
  if (spoken.noticeDue) await deliverWhatsAppReply(to, VOICE_NOTICE);
  if (spoken.seconds !== null && spoken.seconds > textOfferSeconds()) {
    setVoiceOffer(to, reply);
    await deliverWhatsAppReply(to, VOICE_TEXT_OFFER);
  }
  return { delivered: true as const };
}

async function deliverWhatsAppReply(to: string | undefined, body: string, _withMenu = false) {
  if (!to) return { delivered: false as const, reason: "missing_sender" as const };

  try {
    const cleaned = cleanHumanWhatsAppText(body);
    return await sendWhatsAppText(to, cleaned);
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

function confidentialDocumentKind(text: string): VaultDocumentType {
  const v = text.toLowerCase();
  const pick = (type: VaultDocumentType) => (VAULT_DOCUMENT_TYPES as readonly string[]).includes(type) ? type : "other";
  if (/passport/.test(v)) return pick("passport");
  if (/national id|emirates id|id card/.test(v)) return pick("national_id");
  if (/bank/.test(v) || /account statement/.test(v)) return pick("bank_statement");
  if (/licen[cs]e/.test(v)) return pick("business_license");
  if (/tax/.test(v)) return pick("tax_certificate");
  if (/registration|incorporation/.test(v)) return pick("company_registration");
  if (/agreement|spa signed/.test(v)) return pick("commercial_agreement");
  return "other";
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

async function latestStoredDealDocument(dealId: string, documentType: string, senderId: string, recipientId: string) {
  const sharedWith = (userId: string) => inArray(documentsTable.id,
    db.select({ documentId: documentAccessTable.documentId }).from(documentAccessTable)
      .where(eq(documentAccessTable.userId, userId)));
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
    .where(and(condition,
      // A deal association alone is not permission to read another party's file.
      or(eq(documentsTable.uploadedBy, senderId),
        and(eq(documentsTable.status, "approved"), sharedWith(senderId))),
      // Forwarding requires human review and an explicit grant to the recipient.
      ...(recipientId === senderId ? [] : [eq(documentsTable.status, "approved"), sharedWith(recipientId)]),
    ))
    .orderBy(desc(documentsTable.createdAt))
    .limit(1);

  return document ?? null;
}

async function resolveActiveDealForUser(userId: string, replyToProviderMessageId?: string) {
  if (replyToProviderMessageId) {
    const [context] = await db.select({ dealId: whatsappMessageContextsTable.dealId })
      .from(whatsappMessageContextsTable).where(and(
        eq(whatsappMessageContextsTable.providerMessageId, replyToProviderMessageId),
        eq(whatsappMessageContextsTable.recipientUserId, userId),
      )).limit(1);
    if (!context) return null;
    const [participant] = await db.select({ dealId: dealParticipantsTable.dealId })
      .from(dealParticipantsTable).where(and(
        eq(dealParticipantsTable.dealId, context.dealId),
        eq(dealParticipantsTable.userId, userId),
        eq(dealParticipantsTable.status, "active"),
      )).limit(1);
    return participant?.dealId ?? null;
  }
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
  replyToProviderMessageId?: string,
) {
  const [sender] = await db
    .select({ id: usersTable.id, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.phone, from))
    .limit(1);

  if (!sender || sender.status !== "verified") {
    return { reply: "I got the file, but this number isn’t verified for UDC documents yet." };
  }

  // Confidential identity, bank and company records never enter via WhatsApp:
  // do not download, store or process the file; send a private upload link instead.
  const confidentialText = `${document.filename ?? ""} ${document.caption ?? ""}`;
  if (looksLikeConfidentialDocumentTopic(confidentialText)) {
    const kind = confidentialDocumentKind(confidentialText);
    let reply = vaultRedirectReply();
    try {
      const [account] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, sender.id)).limit(1);
      const issue = getVaultLinkIssuer();
      const link = issue ? await issue({ id: sender.id, role: account?.role ?? "" }, kind) : null;
      if (link?.ok) reply = vaultRedirectReply({ url: link.url, expiresAt: link.expiresAt });
    } catch { /* fall back to the text-only reply; never block on the vault */ }
    return { reply };
  }

  const dealId = await resolveActiveDealForUser(sender.id, replyToProviderMessageId);
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

  react("ack", from, inboundProviderMessageId);
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

  await db.insert(documentAccessTable).values({ documentId: savedDocument.id, userId: sender.id, accessRole: "editor" });

  void processDocumentIntelligence({
    documentId: savedDocument.id,
    dealId,
    documentType,
    bytes: media.bytes,
    fileName: document.filename ?? "document",
    mimeType: media.mimeType,
  })
    .then(async (result) => {
      react("complete", from, inboundProviderMessageId);
      const warning = result.status === "needs_review"
        ? " I extracted the available text, but this file may contain scanned/image-only pages, so manual review is still required."
        : "";
      await sendWhatsAppTextWithMenu(
        from,
        `I finished extracting the ${documentType}. Its full text and structured trade data are now saved in this deal.${warning}`,
      ).catch(() => undefined);
    })
    .catch(async () => {
      await sendWhatsAppTextWithMenu(
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
    reply: `Got the ${documentType}. I’ll keep it here for review.\n\n${SENSITIVE_UPLOAD_WARNING}`,
    dealId,
    recipientUserId: sender.id,
  };
}

// Only the early non-binding drafts hide the other side. SPA and FCO need the real names to be signed.
const PRE_NCNDA_DRAFTS = new Set(["LOI", "ICPO"]);

async function isReplyToSavedDealMessage(from: string, contextId?: string) {
  if (!contextId) return false;
  const [row] = await db
    .select({ id: whatsappMessageContextsTable.id })
    .from(whatsappMessageContextsTable)
    .innerJoin(usersTable, eq(usersTable.id, whatsappMessageContextsTable.recipientUserId))
    .where(and(eq(whatsappMessageContextsTable.providerMessageId, contextId), eq(usersTable.phone, from)))
    .limit(1);
  return Boolean(row);
}

async function handleDealWhatsAppMessage(
  from: string,
  text: string,
  replyToProviderMessageId?: string,
  inboundProviderMessageId?: string,
) {
  const explicitMatch = text.trim().match(/^deal\s+(UDC-[A-Z0-9-]+)\s*:\s*(.+)$/i);

  const [sender] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.phone, from))
    .limit(1);

  if (!sender) {
    return explicitMatch || replyToProviderMessageId
      ? { reply: "I don’t recognize this number yet. Make sure it’s linked to your UDC account.", deliveredToCounterparty: false }
      : null;
  }

  if (sender.status !== "verified") {
    if (sender.status === "suspended" || sender.status === "rejected") {
      return { reply: "Your UDC account needs admin review before I can process trade messages.", deliveredToCounterparty: false };
    }
    return explicitMatch || replyToProviderMessageId
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
    } else {
      return { reply: "I couldn’t identify that deal message. Send the deal number so I can attach your reply safely.", deliveredToCounterparty: false };
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
      dealNumber: dealsTable.dealNumber,
      productId: dealsTable.productId,
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

  const pauseRequest = requestedDealPause(messageBody);
  if (pauseRequest) {
    const ctxKind = dealPauseContextKind(pauseRequest.kind);
    if (!pauseRequest.confirmed || replyContextKind !== ctxKind)
      return { reply: dealPausePrompt(pauseRequest.kind, deal.dealNumber), deliveredToCounterparty: false, dealId: deal.id, recipientUserId: sender.id, contextKind: ctxKind };
    const result = await applyDealPause({ dealId: deal.id, dealNumber: deal.dealNumber, senderId: sender.id, receiverId: receiverUserId, kind: pauseRequest.kind });
    if (!result.applied) return { reply: "This deal is already paused, closed or finished, so nothing changed.", deliveredToCounterparty: false, dealId: deal.id, recipientUserId: sender.id };
    return { reply: (pauseRequest.kind === "pause" ? pausedConfirmationToSender : closedConfirmationToSender)(deal.dealNumber, result.told), deliveredToCounterparty: false, dealId: deal.id, recipientUserId: sender.id };
  }

  const draftRequest = requestedWhatsAppDraft(messageBody);
  if (draftRequest) {
    if (!mayPrepareWhatsAppDraft(draftRequest.type, sender.id === deal.buyerUserId)) {
      return { reply: "That draft needs to be requested by the authorized party for this deal.", deliveredToCounterparty: false, dealId: deal.id, recipientUserId: sender.id };
    }
    const [product] = await db.select({ name: productsTable.name }).from(productsTable)
      .where(eq(productsTable.id, deal.productId)).limit(1);
    const acceptedTerms = await recordedDealTerms(deal.id);
    const terms = { paymentTerms:acceptedTerms?.paymentTerms, inspectionTerms:acceptedTerms?.inspectionTerms, dealNumber: deal.dealNumber,
      date: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date()),
      productName: product?.name ?? "", quantity: deal.quantity, unit: deal.unit,
      agreedPrice: deal.agreedPrice, currency: deal.currency, incoterm: deal.incoterm, destination: deal.destination } as SpaDraftInput;
    // Only the requester's own profile details are filled. The other side stays hidden until the NCNDA stage.
    const requesterIsBuyer = sender.id === deal.buyerUserId;
    const [ownCompany] = draftRequest.type === "NCNDA" ? [] : await db
      .select({ name: companiesTable.companyName, address: companiesTable.address, reg: companiesTable.registrationNumber })
      .from(companiesTable).where(eq(companiesTable.ownerUserId, sender.id)).limit(1);
    if (ownCompany && draftRequest.type !== "NCNDA") {
      if (requesterIsBuyer) Object.assign(terms, { buyerName: ownCompany.name, buyerAddress: ownCompany.address, buyerRegistrationNo: ownCompany.reg, hideSeller: PRE_NCNDA_DRAFTS.has(draftRequest.type) });
      else Object.assign(terms, { sellerName: ownCompany.name, sellerAddress: ownCompany.address, sellerRegistrationNo: ownCompany.reg, hideBuyer: PRE_NCNDA_DRAFTS.has(draftRequest.type) });
    }
    const ownDetailsLine = ownCompany && draftRequest.type !== "NCNDA"
      ? `\n\nYour details from your UDC profile will be filled in: ${ownCompany.name}; ${ownCompany.address || "[address missing]"}; ${ownCompany.reg || "[registration no. missing]"}. ${PRE_NCNDA_DRAFTS.has(draftRequest.type) ? " The other side stays hidden until the NCNDA stage." : " The other side stays a placeholder."} Replying with the exact words below confirms these details.`
      : "";
    const confirmationKind = whatsappDraftConfirmation(draftRequest.type, terms);
    if (!draftRequest.confirmed || replyContextKind !== confirmationKind) {
      return { reply: `Prepare a ${draftRequest.type} draft from ${terms.productName || "the recorded product"}, ${Number(terms.quantity).toLocaleString("en-US")} ${terms.unit}, ${terms.currency} ${Number(terms.agreedPrice).toLocaleString("en-US")}/${terms.unit}, ${terms.incoterm || "[Incoterm missing]"} ${terms.destination || "[destination missing]"}? Payment: ${terms.paymentTerms || "DLC directly to seller, after SGS at destination"}. `+ownDetailsLine+"\n\nSend your own or use a UDC draft?\n1. Your own: send your "+draftRequest.type+" here as a file (put "+draftRequest.type+" in the file name or caption).\n2. UDC draft: reply to this message with CONFIRM DRAFT "+draftRequest.type+". Other legal details stay as placeholders.\n\nWarning: the UDC draft is a template only. It is not legal advice. Have your own lawyer review it before you use or sign it. UDC acts only as an introducing agent between buyer and seller.",
        deliveredToCounterparty: false, dealId: deal.id, recipientUserId: sender.id, contextKind: confirmationKind };
    }
    try {
      const draft = await generateWhatsAppDraftPdf(draftRequest.type, terms);
      const path = `deals/${deal.id}/drafts/${randomUUID()}-${draftRequest.type}.pdf`;
      const fileUrl = await uploadDocumentBytes(path, Buffer.from(draft), "application/pdf");
      await db.transaction(async tx => {
        const [document] = await tx.insert(documentsTable).values({ dealId: deal.id, uploadedBy: sender.id,
          documentType: draftRequest.type, fileUrl, status: "pending" }).returning({ id: documentsTable.id });
        await tx.insert(documentAccessTable).values({ documentId: document!.id, userId: sender.id, accessRole: "editor" });
        await tx.insert(auditLogsTable).values({ actorUserId: sender.id, action: `${draftRequest.type.toLowerCase()}_draft_generated`,
          entityType: "deal", entityId: deal.id, metadata: { documentId: document!.id, draftVersion: 1, termsConfirmedByRequester: true, channel: "whatsapp" } });
      });
      return { reply: `Prepared the ${draftRequest.type} draft for your review. It is a UDC template, not legal advice.`, deliveredToCounterparty: false,
        dealId: deal.id, recipientUserId: sender.id, documentToSender: { documentType: draftRequest.type,
          storageObjectPath: path, fileName: `${draftRequest.type}-DRAFT.pdf`, draft: true } };
    } catch (error) {
      // Never answer a draft request with a 500: Meta would retry and the user would hear nothing.
      console.error(JSON.stringify({ event: "whatsapp_draft_failed", dealId: deal.id, draftType: draftRequest.type, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
      return { reply: "I could not prepare that draft right now. Nothing was saved. Please try again in a moment.", deliveredToCounterparty: false, dealId: deal.id, recipientUserId: sender.id };
    }
  }

  const requestedDocument = requestedStoredDocumentType(messageBody, replyContextKind);
  if (requestedDocument) {
    const deliveryTarget = requestedDealDocumentDeliveryTarget(messageBody, sender.role);
    const storedDocument = await latestStoredDealDocument(deal.id, requestedDocument, sender.id,
      deliveryTarget === "counterparty" ? receiverUserId : sender.id);

    if (storedDocument) {
      const storageObjectPath = managedDealDocumentPath(storedDocument.fileUrl,deal.id);
      if (storageObjectPath) {
        const extension = storageObjectPath.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "pdf";

        if (deliveryTarget === "counterparty") {
          const [receiver] = await db
            .select({ phone: usersTable.phone, status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, receiverUserId))
            .limit(1);

          if (!receiver?.phone || receiver.status !== "verified") {
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

    {
      const label = requestedDocument === "LATEST" ? "requested document" : requestedDocument;
      return {
        reply: `I don’t have a reviewed ${label} cleared for sharing yet. UDC needs to review and approve access before I can send it.`,
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
    participantUserId: sender.id,
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

// Real Meta messages always carry a string id (needed to answer each message once) and a string text
// body. Anything else is dropped: no id means a retry would be answered again, and a non-string body
// used to crash the handler with a 500, which makes Meta retry.
function dropMalformedInboundMessages(value: { messages?: unknown } | undefined): void {
  if (!value || !Array.isArray(value.messages)) { if (value && value.messages != null) value.messages = []; return; }
  value.messages = value.messages.filter((m: any) => m && typeof m === "object" && typeof m.id === "string" && m.id &&
    (m.text === undefined || (m.text && typeof m.text.body === "string")));
}

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

// Staging reply sink readout (only when AKIF_WHATSAPP_REPLY_SINK=store). Needs x-udc-sink-signature.
router.get("/webhooks/whatsapp-sink", (req, res) => {
  if (!replySinkEnabled() || !sinkReadAuthorized(req.header("x-udc-sink-signature"))) { res.sendStatus(404); return; }
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const since = Number(req.query.since) || 0;
  res.json({ replies: readSunkReplies(to, since) });
});

router.post("/webhooks/whatsapp", async (req, res) => { await trackReplyFailures((failed) => handleWhatsAppWebhook(req, res, failed)); });
async function handleWhatsAppWebhook(req: Request, res: Response, failedReplies: Set<string>) {
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
    ? req.body.entry.flatMap((entry: { changes?: Array<{ value?: { metadata?: {phone_number_id?: string}; statuses?: Array<{id?:unknown;status?:unknown;timestamp?:unknown;recipient_id?:unknown}>; contacts?: Array<{ profile?: { name?: string } }>; messages?: Array<{ id?: string; from?: string; timestamp?: string; context?: { id?: string }; text?: { body?: string }; interactive?: ChatMessage["interactive"]; audio?: { id?: string; mime_type?: string }; image?: { id?: string; mime_type?: string; caption?: string }; document?: { id?: string; filename?: string; mime_type?: string; caption?: string } }> } }> }) => entry.changes ?? [])
    : [];

  const claimedInbound: unknown[] = [];
  const senderOf = new Map<unknown, string>();
  for (const change of changes) {
    const value = change.value;
    const fullName = value?.contacts?.[0]?.profile?.name;
    // Provider status callbacks contain no inbound text; never route them to
    // intake, AI, consent or a trade action. Only signed Meta bodies reach here.
    if(Array.isArray(value?.statuses) && value.statuses.length &&
      value?.metadata?.phone_number_id===process.env.WHATSAPP_PHONE_NUMBER_ID &&
      Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID)){
      try{
        await recordSignedShipmentStatuses(value.statuses.slice(0,50));
      }catch{
        // Returning non-2xx gives Meta a chance to retry an otherwise lost
        // receipt. No raw phone/provider payloads are logged.
        req.log.error({flow:"whatsapp_shipment_receipt",reason:"persistence_failed"},
          "Signed WhatsApp receipt could not be persisted");
        res.sendStatus(503);return;
      }
    }
    dropMalformedInboundMessages(value);
    for (const message of value?.messages ?? []) {
      if (!(await claimInboundMessage(message.id))) continue; // answer each Meta message id once
      claimedInbound.push(message.id);
      if (message.from) { senderOf.set(message.id, message.from); markReadAndTyping(message.from, message.id); }
      if (message.from && (containsAadhaarNumber(message.text?.body) || mentionsAadhaarDocument(message.text?.body) || mentionsAadhaarDocument(message.document?.filename) || mentionsAadhaarDocument(message.document?.caption) || mentionsAadhaarDocument(message.image?.caption))) {
        try { await deliverWhatsAppReply(message.from, AADHAAR_REFUSAL); } catch { /* best effort */ }
        continue;
      }
      if (message.from) {
        const cap = checkInboundCap(message.from);
        if (cap !== "ok") { if (cap === "notice") await deliverWhatsAppReply(message.from, INBOUND_CAP_NOTICE); continue; }
      }
      if (message.from && (typeof message.text?.body === "string" || Boolean(message.interactive) || typeof message.document?.id === "string" || typeof message.audio?.id === "string" || typeof message.image?.id === "string")) {
        try {
          const privacyReply = await whatsappPrivacyGate(message.from, message.text?.body);
          if (privacyReply) {
            // First consent opens role selection; later chat stays a conversation.
            if (typeof privacyReply === "string") await deliverWhatsAppReply(message.from, privacyReply, false);
            else if (privacyReply.kind === "consent_accepted") await sendChatHome(message.from);
            continue;
          }
          if (typeof message.text?.body === "string") reactByMeaning(message.from, message.id, message.text.body); // only after consent; off unless both flags are on
          const [account] = await db.select({ status: usersTable.status }).from(usersTable)
            .where(eq(usersTable.phone, message.from)).limit(1);
          if (account?.status === "suspended" || account?.status === "rejected") {
            await deliverWhatsAppReply(message.from, "Your UDC account needs admin review before I can process trade messages.");
            continue;
          }
          // Signed, consented, verified inbound evidence only. Default OFF:
          // migration must be approved before this gate is enabled in staging.
          if (account?.status === "verified" &&
              process.env.UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED === "true" &&
              typeof value?.metadata?.phone_number_id === "string" &&
              value.metadata.phone_number_id === process.env.WHATSAPP_PHONE_NUMBER_ID) {
            try {
              await recordSignedCustomerInbound({
                phone:message.from,providerMessageId:message.id,
                timestamp:message.timestamp,
              });
            } catch {
              // Never claim a valid customer-service window if storing the
              // evidence fails; leave chatbot processing otherwise unchanged.
              req.log.warn({flow:"whatsapp_customer_window",reason:"evidence_unavailable"},
                "Inbound message evidence unavailable; outbound authorization remains blocked");
            }
          }
        } catch {
          req.log.error({ flow: "privacy_consent", reason: "consent_check_failed" }, "UDC privacy check unavailable");
          await deliverWhatsAppReply(message.from, "I couldn’t check your privacy preferences. Please try again shortly.");
          continue;
        }
      }
      if (message.from && typeof message.text?.body === 'string') {
        const recoveryReply = await handlePhoneRecovery(message.from,message.text.body);
        if (recoveryReply !== null) { await deliverWhatsAppReply(message.from,recoveryReply); continue; }
      }
      if (message.from && typeof message.text?.body === 'string') {
        const emailReply = await handleEmailVerification(message.from,message.text.body);
        if (emailReply !== null) { await deliverWhatsAppReply(message.from,emailReply); continue; }
      }
      // Explicit menu requests take precedence over AI guidance. Never open
      // the menu for ordinary greetings, consent, or unrelated chat messages.
      if(message.from && chatAction(message)==='menu'){
        try{if(await handleChatUi(message.from,message))continue;}
        catch{await deliverWhatsAppReply(message.from,'I couldn\'t open the menu right now. You can still message Akif normally.');continue;}
      }
      // Complaints are logged and acknowledged immediately, never answered by the model.
      if (message.from && message.text?.body && isGrievance(message.text.body)) {
        try {
          const [who] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, message.from)).limit(1);
          const receivedAt = new Date();
          const dueAt = grievanceDeadline(receivedAt);
          const [row] = await db.insert(auditLogsTable).values({ actorUserId: who?.id ?? null, action: "grievance_received", entityType: "grievance", entityId: who?.id ?? null,
            metadata: { channel: "whatsapp", providerMessageId: message.id ?? null, text: scrubAadhaar(message.text.body).slice(0, 2000), dueAt: dueAt.toISOString(), phoneHash: guidedChatPhoneHash(message.from) } }).returning({ id: auditLogsTable.id });
          await deliverWhatsAppReply(message.from, acknowledgementReply(String(row!.id).slice(0, 8).toUpperCase(), dueAt));
          continue;
        } catch { /* fall through: a failed log must not silently drop the complaint */
          await deliverWhatsAppReply(message.from, `I couldn't record your complaint just now. Please email ${SUPPORT_EMAIL} or try again shortly.`).catch(() => undefined);
          continue;
        }
      }
      // A person asking for a human is never answered by the model: record it and say so honestly.
      if (message.from && message.text?.body && wantsHumanHelp(message.text.body)) {
        try {
          const [asker] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, message.from)).limit(1);
          await db.insert(auditLogsTable).values({ actorUserId: asker?.id ?? null, action: "akif_human_handoff_requested",
            entityType: "user", entityId: asker?.id ?? null, metadata: { channel: "whatsapp", providerMessageId: message.id ?? null } });
          await deliverWhatsAppReply(message.from, HUMAN_HANDOFF_REPLY);
          continue;
        } catch { /* fall through to normal handling rather than dropping the message */ }
      }
      // Learning questions bypass deal/intake routing, including replies quoting the Ask Akif menu.
      if (message.from && typeof message.text?.body === "string") {
        const pendingOffer = takeVoiceOffer(message.from);
        if (pendingOffer && isOfferYes(message.text.body)) { await deliverWhatsAppReply(message.from, pendingOffer); continue; }
        if (voiceRepliesEnabled() && parseVoiceRequest(message.text.body)) {
          const wantsVoice = (await getVoiceState(message.from)) !== "text_only";
          if (wantsVoice) armExplicitVoice(message.from);
          await deliverWhatsAppReply(message.from, wantsVoice ? EXPLICIT_VOICE_CONFIRMATION : EXPLICIT_VOICE_TEXT_ONLY);
          continue;
        }
        const voiceCommand = parseVoiceCommand(message.text.body);
        if (voiceCommand) {
          const saved = await setTextOnly(message.from, voiceCommand === "text_only");
          await deliverWhatsAppReply(message.from, saved
            ? (voiceCommand === "text_only" ? TEXT_ONLY_CONFIRMATION : VOICE_ON_CONFIRMATION)
            : "I couldn’t save that voice setting just now. Please try again shortly.");
          continue;
        }
      }
      if (message.from && message.text?.body && requestedWhatsAppDraft(message.text.body) === null && isGuidanceQuestion(message.text.body)) {
        try {
          // UDC/AKIF can occur in a person's or company's name. Consume a
          // clear answer to the active form before keyword-based tutoring;
          // actual learning questions still bypass intake without a model call.
          if (await handleChatUi(message.from, message, true)) continue;
          const reply = await answerGuidance(message.from, message.text.body, message.id);
          if (reply !== null) { if (reply) await deliverAnswer(message.from, reply, consumeExplicitVoice(message.from)); continue; }
        } catch {
          await deliverWhatsAppReply(message.from, "I couldn’t prepare that answer just now. Please try your question again shortly.");
          continue;
        }
      }
      if (message.from) {
        try { if (await handleChatUi(message.from, message)) continue; }
        catch { await deliverWhatsAppReply(message.from, 'I could not open that WhatsApp feature just now. Send Menu and try again.'); continue; }
      }
      if (message.from && typeof message.audio?.id === "string") {
        if (!isAkifWorkerMediaEnabled()) {
          await deliverWhatsAppReply(message.from, "Voice notes aren’t available right now. Please type your message.");
          continue;
        }
        if (!reserveTranscription(message.from)) {
          await deliverWhatsAppReply(message.from, "You’ve reached today’s voice note limit. Please type your message and I’ll keep helping.");
          continue;
        }
        let voiceStage: 'download' | 'transcription' | 'answer' | 'trade_context' = 'download';
        try {
          react("ack", message.from, message.id);
          const media = await downloadWhatsAppMedia(message.audio.id);
          voiceStage = 'transcription';
          const heard = await transcribeAkifAudioDetailed({ bytes: media.bytes, mimeType: media.mimeType });
          const transcript = heard.text;
          const pendingOffer = takeVoiceOffer(message.from);
          if (pendingOffer && isOfferYes(transcript)) { await deliverWhatsAppReply(message.from, pendingOffer); continue; }
          voiceStage = 'answer';
          const guidance = await answerGuidance(message.from, transcript, message.id, true, false, heard.language ? VOICE_LANGUAGE_NAMES[heard.language.toLowerCase()] : undefined);
          if (guidance !== null) {
            if (guidance) await deliverAnswer(message.from, guidance, true);
            continue;
          }
          voiceStage = 'trade_context';
          const [speaker] = await db.select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
            .from(usersTable).where(eq(usersTable.phone, message.from)).limit(1);
          const voiceDealId = speaker?.status === "verified" ? await resolveActiveDealForUser(speaker.id, message.context?.id) : null;
          if (voiceDealId && speaker) {
            await db.insert(dealConversationEventsTable).values({ dealId: voiceDealId, userId: speaker.id,
              participantRole: speaker.role, intent: "voice_transcript_unconfirmed",
              originalText: transcript, relayText: null, relayed: false });
          }
          await deliverWhatsAppReply(message.from, `I heard: ${transcript.slice(0, 2000)}${transcript.length > 2000 ? "…" : ""} Please confirm the key trade terms in text before I forward or act on them.`);
          continue;
        } catch {
          req.log.error({ flow: 'voice_message', stage: voiceStage, reason: 'voice_processing_failed' }, 'UDC voice processing failed');
          const reply = voiceStage === 'answer'
            ? "I read your voice note, but couldn’t prepare an answer just now. Please try your question again shortly."
            : voiceStage === 'trade_context'
              ? "I read your voice note, but couldn’t check the deal context. Please confirm any trade instructions in text."
              : voiceStage === 'download'
                ? "I couldn’t download that voice note just now. Please resend it shortly."
                : "Voice transcription is unavailable just now. Please try again shortly or type your question.";
          await deliverWhatsAppReply(message.from, reply);
          continue;
        }
      }
      if (typeof message.image?.id === "string") {
        const mime = message.image.mime_type;
        message.document = { id: message.image.id, mime_type: mime, caption: message.image.caption,
          filename: mime === "image/png" ? "trade-image.png" : "trade-image.jpg" };
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
            message.context?.id,
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

      if (message.from && parseSigninCommand(message.text.body)) {
        try { await deliverWhatsAppReply(message.from, (await handleWhatsAppSignin(message.from,message.text.body,fullName))!); }
        catch { await deliverWhatsAppReply(message.from, 'Sign-in is unavailable just now. Please start a new request shortly.'); }
        continue;
      }

      if (message.from && isAgentRegistrationRequest(message.text.body)) {
        try { await deliverWhatsAppReply(message.from, await registerWhatsAppAgent(message.from, fullName)); }
        catch { await deliverWhatsAppReply(message.from, "I couldn’t save the agent registration just now. Please try again shortly."); }
        continue;
      }

      const pendingIntake = message.from
        ? await loadWhatsAppIntakeDraft(message.from)
        : null;
      const sellerAwaitingAnotherProduct = Boolean(
        pendingIntake
        && !pendingIntake.stale
        && pendingIntake.role === "seller"
        && pendingIntake.draft.awaitingAnotherProduct,
      );
      const anotherProductYes = /^(?:(?:yes|yeah|yep|sure|of course)(?:\s+please)?|add another|another product|i have another)[.! ]*$/i.test(message.text.body.trim());
      const anotherProductNo = /^(?:no|no thanks|no thank you|no[, ]+(?:that’s all|that's all)|not now|that’s all|that's all|done)[.! ]*$/i.test(message.text.body.trim());
      if (message.from && sellerAwaitingAnotherProduct && anotherProductYes) {
        await saveWhatsAppIntakeDraft({
          phone: message.from,
          role: "seller",
          fullName: pendingIntake!.fullName ?? undefined,
          draft: {},
          providerMessageId: message.id,
        });
        await deliverWhatsAppReply(message.from, "Sure. What product would you like to offer?");
        continue;
      }
      if (message.from && sellerAwaitingAnotherProduct && anotherProductNo) {
        await clearWhatsAppIntakeDraft({
          phone: message.from,
          role: "seller",
          fullName: pendingIntake!.fullName ?? undefined,
          providerMessageId: message.id,
        });
        await deliverWhatsAppReply(message.from, "Okay. I’ll keep this offer with UDC for review.");
        continue;
      }
      const sellerStartsAnotherProduct = Boolean(
        sellerAwaitingAnotherProduct
        && /^(?:yes|yeah|yep|sure|of course)\b[\s,:-]+\S/i.test(message.text.body.trim()),
      );
      const hasPendingIntake = Boolean(
        pendingIntake
        && !pendingIntake.stale
        && !sellerAwaitingAnotherProduct
        && !pendingIntake.draft.submittedRecordId
        && Boolean(pendingIntake.draft.product || pendingIntake.draft.quantity),
      );
      const repeatedSubmittedIntake = Boolean(pendingIntake && !pendingIntake.stale
        && pendingIntake.draft.submittedRecordId
        && pendingIntake.draft.conversation?.at(-1)?.message.trim().toLowerCase() === message.text.body.trim().toLowerCase());
      const explicitNewIntake = sellerStartsAnotherProduct || isExplicitSeparateTradeIntake(message.text.body)
        || (!hasPendingIntake && !repeatedSubmittedIntake && !message.context?.id && isStandaloneBuyerInquiry(message.text.body));

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

      // Draft commands and replies to a saved bot message are deal actions. They must not
      // depend on the AI model choosing to hand them back, or a recent chat can swallow them.
      const dealActionDirect = Boolean(message.from) && (
        requestedWhatsAppDraft(message.text.body) !== null
        || requestedDealPause(message.text.body) !== null
        || await isReplyToSavedDealMessage(message.from, message.context?.id)
      );
      if (message.from && !hasPendingIntake && !explicitNewIntake && !repeatedSubmittedIntake) {
        // Short follow-ups such as “and FOB” remain in the tutoring conversation.
        // Explicit trade commands still return to the authorized deal workflow.
        try {
          if (!dealActionDirect && askedAboutPausingDeal(message.text.body)) { await deliverWhatsAppReply(message.from, dealPauseHowTo); continue; }
          const reply = dealActionDirect ? null : await answerGuidance(message.from, message.text.body, message.id, false, true);
          if (reply !== null) { if (reply) await deliverAnswer(message.from, reply, consumeExplicitVoice(message.from)); continue; }
        } catch {
          await deliverWhatsAppReply(message.from, "I couldn’t prepare that answer just now. Please try your question again shortly.");
          continue;
        }
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
              ? `Sent the ${dealMessage.documentToSender.documentType}.${"draft" in dealMessage.documentToSender ? " It is a private UDC template, not legal advice. Complete the placeholders and have your lawyer review it before sharing or signing. UDC acts only as an introducing agent between buyer and seller." : ""}`
              : `I’ve got the ${dealMessage.documentToSender.documentType}, but it didn’t send. I’ll keep it here for now.`;
            const delivery = await deliverWhatsAppReply(message.from, replyBody);
            if (documentDelivered) react("complete", message.from, message.id); // one ✅ on the user's request once the document went out

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
        && !explicitNewIntake
        && !savedIntake.stale
        && Object.keys(savedIntake.draft ?? {}).length > 0,
      );
      const intakeDecision = await interpretIntakeConversation({
        message: message.text.body,
        role: isSellerOffer(message.text.body) || sellerStartsAnotherProduct ? "seller" : savedIntake?.role === "seller" ? "seller" : "buyer",
        memory: hasSavedDraft && !sellerStartsAnotherProduct ? savedIntake!.draft : null,
      });
      if (!intakeDecision) {
        // The model is slow or rate limited. Do not dead-end: the guided form needs no AI, so continue there.
        const fallbackAction = isSellerOffer(message.text.body) || savedIntake?.role === "seller" ? "offer" : "requirement";
        await deliverWhatsAppReply(message.from, "My assistant is busy right now, so I will take your details step by step instead.");
        try { if (await handleChatUi(message.from, { id: message.id ? `${message.id}:ai-fallback` : undefined, interactive: { type: "list_reply", list_reply: { id: `udc:${fallbackAction}` } } } as ChatMessage)) continue; } catch { /* fall through to the plain retry note */ }
        await deliverWhatsAppReply(message.from, "I couldn’t process that just now. Please try again in about a minute.");
        continue;
      }
      const intakeRole = repeatedSubmittedIntake ? savedIntake!.role as "buyer" | "seller" : intakeDecision.role;
      if (message.from) {
        const [account] = await db.select({ role: usersTable.role }).from(usersTable)
          .where(eq(usersTable.phone, message.from)).limit(1);
        // Model extraction cannot authorize another account role. Apply the
        // same boundary as native forms before writes or intake-memory changes.
        if (account && account.role !== intakeRole) {
          await deliverWhatsAppReply(message.from,
            `Your account is registered as ${account.role}. UDC must review role changes before you submit as a ${intakeRole}.`);
          continue;
        }
      }
      const previousDraft = !explicitNewIntake && (repeatedSubmittedIntake || !intakeDecision.newIntake) && savedIntake?.role === intakeRole
        ? savedIntake.draft : null;

      const contactName =
        fullName?.trim()
        || savedIntake?.fullName?.trim()
        || "WhatsApp User";

      const buyerDraft = intakeRole === "buyer"
        ? mergeBuyerRequirementDraft(previousDraft, { ...intakeDecision.fields, missingFields: [] }, "")
        : null;
      const sellerDraft = intakeRole === "seller"
        ? mergeSellerOfferDraft(
            previousDraft,
            { ...intakeDecision.fields, ...Object.fromEntries(Object.entries(triageSellerOffer(message.text.body)).filter(([key, value]) => key !== "missingFields" && value !== undefined)), missingFields: [] },
          )
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
              specification: sellerDraft.specification,
              availability: sellerDraft.availability,
              inspectionTerms: sellerDraft.inspectionTerms,
              paymentTerms: sellerDraft.paymentTerms,
              monthlyCapacity: sellerDraft.monthlyCapacity,
              minimumOrderQuantity: sellerDraft.minimumOrderQuantity,
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
              specification: buyerDraft.specification,
              deliveryTime: buyerDraft.deliveryTime,
              contractDuration: buyerDraft.contractDuration,
              inspectionRequirements: buyerDraft.inspectionRequirements,
              paymentTerms: buyerDraft.paymentTerms,
            })
          : null;

      const reply = sellerDraft && !previousDraft?.submittedRecordId && (sellerDraft.missingFields.length > 0 || record)
        ? sellerOfferReply(sellerDraft)
        : intakeDecision.reply;

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
              specification: sellerDraft.specification,
              availability: sellerDraft.availability,
              inspectionTerms: sellerDraft.inspectionTerms,
              paymentTerms: sellerDraft.paymentTerms,
              monthlyCapacity: sellerDraft.monthlyCapacity,
              minimumOrderQuantity: sellerDraft.minimumOrderQuantity,
            }
          : {
              product: buyerDraft?.product,
              quantity: buyerDraft?.quantity,
              unit: buyerDraft?.unit,
              targetPrice: buyerDraft?.targetPrice,
              currency: buyerDraft?.currency,
              destination: buyerDraft?.destination,
              incoterm: buyerDraft?.incoterm,
              specification: buyerDraft?.specification,
              deliveryTime: buyerDraft?.deliveryTime,
              contractDuration: buyerDraft?.contractDuration,
              inspectionRequirements: buyerDraft?.inspectionRequirements,
              paymentTerms: buyerDraft?.paymentTerms,
            };

        await saveWhatsAppIntakeDraft({
          phone: message.from,
          role: intakeRole,
          fullName: contactName,
          draft: {
            ...draftForStorage,
            submittedRecordId: record?.id ?? previousDraft?.submittedRecordId,
            ...(record && sellerDraft ? { awaitingAnotherProduct: true } : {}),
            conversation: [...(previousDraft?.conversation ?? []), {
              message: message.text.body, reply,
            }].slice(-12),
          },
          providerMessageId: message.id,
        });
      }

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

  // A reply that Meta throttled (429 / rate-limit code) even after retries must not leave the claim completed:
  // release it and answer non-2xx so Meta redelivers the message.
  const lost = claimedInbound.filter((id) => { const from = senderOf.get(id); return from !== undefined && failedReplies.has(from); });
  if (lost.length) {
    await releaseInboundMessages(lost);
    await completeInboundMessages(claimedInbound.filter((id) => !lost.includes(id)));
    req.log.warn({ flow: "whatsapp_reply", reason: "rate_limited_reply_released", count: lost.length }, "WhatsApp reply could not be delivered; asking Meta to redeliver");
    res.sendStatus(503);
    return;
  }
  await completeInboundMessages(claimedInbound);
  res.sendStatus(200);
}

export default router;

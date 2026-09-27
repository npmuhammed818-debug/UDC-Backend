import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, dealParticipantsTable, dealsTable, messagesTable, usersTable, whatsappMessageContextsTable } from "@workspace/db";
import { buyerRequirementReply } from "../akif/buyerRequirementReply";
import { recordPendingBuyerRequirement } from "../akif/recordBuyerRequirement";
import { recordPendingSellerOffer } from "../akif/recordPendingSellerOffer";
import { sellerOfferReply } from "../akif/sellerOfferReply";
import { queueWhatsAppResearch } from "../akif/queueResearch";
import { isSellerOffer, triageSellerOffer } from "../akif/sellerOfferTriage";
import { triageBuyerRequirement } from "../akif/buyerRequirementTriage";
import { sendWhatsAppText } from "../whatsapp/client";
import { requireRole } from "../auth/middleware";

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

function classifyNegotiationIntent(text: string) {
  const normalized = text.trim().toLowerCase();

  if ([
    /\b(?:i|we)\s+(?:will|would|want to)\s+(?:buy|take|proceed)\b/,
    /\b(?:i|we)\s+(?:agree|accept|confirm|approve)\b/,
    /\b(?:accepted|agreed|confirmed|go ahead|proceed with (?:it|the deal)|buy from them)\b/,
  ].some((pattern) => pattern.test(normalized))) {
    return "acceptance" as const;
  }

  if ([
    /\b(?:i|we)\s+(?:reject|decline|do not accept|don't accept|will not buy|won't buy)\b/,
    /\b(?:reject|rejected|decline|declined|not interested|cancel the deal)\b/,
  ].some((pattern) => pattern.test(normalized))) {
    return "rejection" as const;
  }

  if ([
    /\b(?:counter|counteroffer|counter offer|make it|lower the price|too expensive|price is too high|can you do)\b/,
    /\b(?:usd|aed|inr|eur)\s*\d[\d,.]*/i,
    /\b\d[\d,.]*\s*(?:usd|aed|inr|eur)\b/i,
  ].some((pattern) => pattern.test(normalized))) {
    return "counteroffer" as const;
  }

  return null;
}

async function handleDealWhatsAppMessage(
  from: string,
  text: string,
  replyToProviderMessageId?: string,
) {
  const explicitMatch = text.trim().match(/^deal\s+(UDC-[A-Z0-9-]+)\s*:\s*(.+)$/i);
  const naturalIntent = classifyNegotiationIntent(text);

  const [sender] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.phone, from))
    .limit(1);

  if (!sender) {
    return explicitMatch || naturalIntent || replyToProviderMessageId
      ? { reply: "UDC could not link this WhatsApp number to a trade account.", deliveredToCounterparty: false }
      : null;
  }

  if (sender.status !== "verified") {
    return explicitMatch || naturalIntent || replyToProviderMessageId
      ? { reply: "Your UDC account must be verified before deal negotiation.", deliveredToCounterparty: false }
      : null;
  }

  let resolvedDealId: string | null = null;
  let explicitDealNumber: string | null = null;
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
    explicitDealNumber = explicitMatch[1]!.toUpperCase();
    messageBody = explicitMatch[2]!.trim();
    const [explicitDeal] = await db
      .select({ id: dealsTable.id })
      .from(dealsTable)
      .where(eq(dealsTable.dealNumber, explicitDealNumber))
      .limit(1);

    if (!explicitDeal) {
      return {
        reply: `UDC could not find deal ${explicitDealNumber}. Check the deal number and try again.`,
        deliveredToCounterparty: false,
      };
    }
    resolvedDealId = explicitDeal.id;
  }

  if (!resolvedDealId && naturalIntent) {
    const activeDeals = await db
      .select({
        id: dealsTable.id,
        dealNumber: dealsTable.dealNumber,
      })
      .from(dealParticipantsTable)
      .innerJoin(dealsTable, eq(dealParticipantsTable.dealId, dealsTable.id))
      .where(and(
        eq(dealParticipantsTable.userId, sender.id),
        eq(dealParticipantsTable.status, "active"),
        eq(dealsTable.status, "negotiation"),
      ));

    if (activeDeals.length === 0) return null;

    if (activeDeals.length > 1) {
      const dealNumbers = activeDeals.slice(0, 5).map((deal) => deal.dealNumber).join(", ");
      return {
        reply: `You have multiple active negotiations. Reply to the specific UDC message or write the deal number. Active deals: ${dealNumbers}.`,
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
      status: dealsTable.status,
      buyerUserId: dealsTable.buyerUserId,
      sellerUserId: dealsTable.sellerUserId,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, resolvedDealId))
    .limit(1);

  if (!deal) {
    return { reply: "UDC could not find that deal.", deliveredToCounterparty: false };
  }

  if (deal.status !== "negotiation") {
    return {
      reply: `Deal ${deal.dealNumber} is currently ${deal.status}, so negotiation messages are not open.`,
      deliveredToCounterparty: false,
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
    return { reply: "This WhatsApp account is not an active participant in that UDC deal.", deliveredToCounterparty: false };
  }

  const receiverUserId = sender.id === deal.buyerUserId
    ? deal.sellerUserId
    : sender.id === deal.sellerUserId
      ? deal.buyerUserId
      : null;

  if (!receiverUserId) {
    return { reply: "This WhatsApp account is not a buyer or seller on that UDC deal.", deliveredToCounterparty: false };
  }

  const [receiver] = await db
    .select({ phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, receiverUserId))
    .limit(1);

  const intent = classifyNegotiationIntent(messageBody) ?? "message";

  await db.insert(messagesTable).values({
    dealId: deal.id,
    senderUserId: sender.id,
    receiverUserId,
    message: messageBody,
  });

  let deliveredToCounterparty = false;
  if (receiver?.phone) {
    const delivery = await deliverWhatsAppReply(
      receiver.phone,
      `UDC deal ${deal.dealNumber} — ${sender.role} ${intent}: ${messageBody}`,
    );
    deliveredToCounterparty = delivery.delivered;
  }

  const intentLabel = intent === "message" ? "negotiation message" : intent;
  return {
    reply: deliveredToCounterparty
      ? `UDC understood this as your ${intentLabel} for ${deal.dealNumber}, recorded it, and sent it to the other party.`
      : `UDC understood this as your ${intentLabel} for ${deal.dealNumber} and recorded it. Counterparty WhatsApp delivery could not be confirmed.`,
    deliveredToCounterparty,
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
    ? req.body.entry.flatMap((entry: { changes?: Array<{ value?: { contacts?: Array<{ profile?: { name?: string } }>; messages?: Array<{ id?: string; from?: string; context?: { id?: string }; text?: { body?: string } }> } }> }) => entry.changes ?? [])
    : [];

  for (const change of changes) {
    const value = change.value;
    const fullName = value?.contacts?.[0]?.profile?.name;
    for (const message of value?.messages ?? []) {
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
            req.log.info(
              { flow: "deal_negotiation", counterpartyDelivered: dealMessage.deliveredToCounterparty },
              "UDC processed WhatsApp deal negotiation message",
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

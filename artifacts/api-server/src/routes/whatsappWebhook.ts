import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { buyerRequirementReply } from "../akif/buyerRequirementReply";
import { recordPendingBuyerRequirement } from "../akif/recordBuyerRequirement";
import { recordPendingSellerOffer } from "../akif/recordPendingSellerOffer";
import { sellerOfferReply } from "../akif/sellerOfferReply";
import { queueWhatsAppResearch } from "../akif/queueResearch";
import { isSellerOffer, triageSellerOffer } from "../akif/sellerOfferTriage";
import { triageBuyerRequirement } from "../akif/buyerRequirementTriage";
import { sendWhatsAppText } from "../whatsapp/client";

const router: IRouter = Router();

function isEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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
    ? req.body.entry.flatMap((entry: { changes?: Array<{ value?: { contacts?: Array<{ profile?: { name?: string } }>; messages?: Array<{ id?: string; from?: string; text?: { body?: string } }> } }> }) => entry.changes ?? [])
    : [];

  for (const change of changes) {
    const value = change.value;
    const fullName = value?.contacts?.[0]?.profile?.name;
    for (const message of value?.messages ?? []) {
      if (typeof message.text?.body !== "string") continue;

      if (message.from) {
        const research = await queueWhatsAppResearch(message.from, message.text.body);
        if (research) {
          const reply =
            `AKIF queued your ${research.intent.direction} research for ${research.intent.product} in ${research.intent.targetCountry}. UDC will keep the research result separate from verification and deal approval.`;
          const delivery = await sendWhatsAppText(message.from, reply);
          req.log.info(
            {
              whatsappMessageId: message.id,
              flow: "akif_research",
              researchRunId: research.run.id,
              delivery,
            },
            "AKIF queued WhatsApp research request",
          );
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
        : sellerDraft ? sellerOfferReply(sellerDraft) : buyerRequirementReply(buyerDraft!);
      const delivery = message.from
        ? await sendWhatsAppText(message.from, reply)
        : { delivered: false as const, reason: "missing_sender" as const };
      req.log.info(
        { whatsappMessageId: message.id, flow: sellerDraft ? "seller_offer" : "buyer_requirement", recordId: record?.id, missingFields: sellerDraft?.missingFields ?? buyerDraft?.missingFields, delivery },
        "AKIF processed verified WhatsApp trade message",
      );
    }
  }

  res.sendStatus(200);
});

export default router;

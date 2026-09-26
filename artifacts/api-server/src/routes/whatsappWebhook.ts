import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { triageBuyerRequirement } from "../akif/buyerRequirementTriage";

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

  if (
    !verifyToken ||
    mode !== "subscribe" ||
    typeof token !== "string" ||
    !isEqual(token, verifyToken) ||
    typeof challenge !== "string"
  ) {
    res.sendStatus(403);
    return;
  }

  res.type("text/plain").send(challenge);
});

router.post("/webhooks/whatsapp", (req, res) => {
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

  const messages = Array.isArray(req.body?.entry)
    ? req.body.entry.flatMap((entry: { changes?: Array<{ value?: { messages?: Array<{ id?: string; text?: { body?: string } }> } }> }) =>
        (entry.changes ?? []).flatMap((change) => change.value?.messages ?? []),
      )
    : [];

  for (const message of messages) {
    if (typeof message.text?.body !== "string") continue;
    const draft = triageBuyerRequirement(message.text.body);
    req.log.info(
      { whatsappMessageId: message.id, missingFields: draft.missingFields },
      "AKIF triaged verified WhatsApp buyer message",
    );
  }

  res.sendStatus(200);
});

export default router;

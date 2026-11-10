import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  admitHumanRelayReply,
  humanRelayActiveFor,
  humanRelayEnabled,
  humanRelayNumbers,
  lastHeardLanguageFor,
  markHumanRelayAnswered,
  pendingHumanRelay,
  relayBodyAuthorized,
  relayReadAuthorized,
  validateRelayReplyText,
  decodeRelayAudio,
} from "../akif/humanRelay";
import { isBrainOrchestratorEnabled } from "../akif/brainOrchestrator";
import { isAkifWorkerMediaEnabled } from "../akif/intelligence/workerClient";
import { voiceRepliesEnabled } from "../akif/voiceReply.ts";
import { replySinkEnabled, replySinkSendAllowed } from "../whatsapp/replySink";
import { sendWhatsAppVoiceNote } from "../whatsapp/client";
import { buildHumanRelayDraft, deliverHumanRelayReply } from "./whatsappWebhook";

const router: IRouter = Router();

const replySchema = z
  .object({
    phone: z.string().min(8).max(24),
    text: z.string().min(1).max(2000).optional(),
    voice: z.boolean().optional(),
    // Dev-made voice note (owner-approved 10 Nov, allowlist only): the dev side
    // renders audio itself and the bot sends it as a WhatsApp voice note, so a
    // dev-side answer costs no TTS provider quota. Ogg/Opus only, 16 MB max.
    audioBase64: z.string().min(8).max(23_000_000).optional(),
  })
  .strict()
  .refine((v) => v.text || v.audioBase64, { message: "text_or_audio_required" });

const skipSchema = z
  .object({
    phone: z.string().min(8).max(24),
  })
  .strict();

const askSchema = z
  .object({
    phone: z.string().min(8).max(24),
    text: z.string().min(1).max(2000),
  })
  .strict();

// Staging human relay (default OFF). Every endpoint needs a signature made
// with the staging app secret - reads sign "read-relay", writes sign the raw
// JSON body - the same trust bar as the reply-sink readout. Everything answers
// 404 when the relay is off or the signature is wrong.
function readAuthorized(req: Request, res: Response): boolean {
  if (!humanRelayEnabled() || !relayReadAuthorized(req.header("x-udc-relay-signature"))) {
    res.sendStatus(404);
    return false;
  }
  return true;
}

function writeAuthorized(req: Request, res: Response): boolean {
  if (!humanRelayEnabled() || !relayBodyAuthorized(req.header("x-udc-relay-signature"), (req as Request & { rawBody?: Buffer }).rawBody)) {
    res.sendStatus(404);
    return false;
  }
  return true;
}

// Dev-side "ask" (staging relay only): run one silent brain turn - with its
// tools - for an allowlisted conversation and return the draft. Nothing is
// held, recorded or sent; the human decides what (if anything) goes out.
router.post("/akif-relay/ask", async (req, res) => {
  if (!writeAuthorized(req, res)) return;
  const parsed = askSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ ok: false, error: "invalid_body" }); return; }
  if (!humanRelayActiveFor(parsed.data.phone)) { res.status(400).json({ ok: false, error: "not_allowlisted" }); return; }
  const draft = await buildHumanRelayDraft(parsed.data.phone, parsed.data.text);
  res.json({ ok: true, draft: draft?.reply ?? null, draftBackgroundDiscarded: draft?.backgroundDiscarded ?? false });
});

router.get("/akif-relay/status", (req, res) => {
  if (!readAuthorized(req, res)) return;
  const numbers = humanRelayNumbers();
  res.set("Cache-Control", "no-store").json({
    enabled: true,
    pending: pendingHumanRelay().length,
    relayNumbers: numbers.length,
    brainDrafts: isBrainOrchestratorEnabled(),
    voiceNotesIn: isAkifWorkerMediaEnabled(),
    voiceReplies: voiceRepliesEnabled(),
    replySinkStore: replySinkEnabled(),
    realSendToRelayNumbers: numbers.filter((n) => replySinkSendAllowed(n)).length,
  });
});

router.get("/akif-relay/pending", (req, res) => {
  if (!readAuthorized(req, res)) return;
  res.set("Cache-Control", "no-store").json({ pending: pendingHumanRelay() });
});

router.post("/akif-relay/reply", async (req, res) => {
  if (!writeAuthorized(req, res)) return;
  const parsed = replySchema.safeParse(req.body);
  const text = parsed.success && parsed.data.text ? validateRelayReplyText(parsed.data.text) : null;
  const audio = parsed.success && parsed.data.audioBase64 ? decodeRelayAudio(parsed.data.audioBase64) : null;
  if (!parsed.success || (text === null && audio === null) || (parsed.success && parsed.data.text && text === null) || (parsed.success && parsed.data.audioBase64 && audio === null)) {
    res.status(400).json({ ok: false, error: "invalid_reply" });
    return;
  }
  const { phone, voice } = parsed.data!;
  // Outbound is locked to the same allowlist as inbound: in this phase that is
  // the owner's own number only.
  if (!humanRelayActiveFor(phone)) {
    res.status(403).json({ ok: false, error: "number_not_relay_allowlisted" });
    return;
  }
  if (!admitHumanRelayReply()) {
  res.status(429).json({ ok: false, error: "reply_rate_limit" });
    return;
  }
  const delivery = audio
    ? await sendWhatsAppVoiceNote(phone, audio)
    : await deliverHumanRelayReply(phone, text!, {
        voice,
        heardLanguage: lastHeardLanguageFor(phone),
      });
  if (!delivery.delivered) {
    res.status(502).json({ ok: false, error: "delivery_failed", reason: delivery.reason });
    return;
  }
  const answered = markHumanRelayAnswered(phone);
  res.set("Cache-Control", "no-store").json({ ok: true, delivered: true, answered });
});

router.post("/akif-relay/skip", (req, res) => {
  if (!writeAuthorized(req, res)) return;
  const parsed = skipSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "invalid_skip" });
    return;
  }
  if (!humanRelayActiveFor(parsed.data.phone)) {
    res.status(403).json({ ok: false, error: "number_not_relay_allowlisted" });
    return;
  }
  const skipped = markHumanRelayAnswered(parsed.data.phone);
  res.set("Cache-Control", "no-store").json({ ok: true, skipped });
});

export default router;

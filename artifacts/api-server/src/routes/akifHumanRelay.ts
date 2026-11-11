import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  admitHumanRelayReply,
  humanRelayActiveFor,
  humanRelayEnabled,
  humanRelayNumbers,
  hasActiveHumanRelayClaim,
  stickyWorkerFor,
  lastHeardLanguageFor,
  markHumanRelayAnswered, releaseHumanRelayClaim, claimHumanRelay, claimHumanRelayWithWait, answerClaimedHumanRelayItem,
  relayReplyCooldownActive, noteHumanRelayReplySent, relayClaimStillValid, relayReplyResetsConversation,
  pendingHumanRelay,
  relayBodyAuthorized,
  relayReadAuthorized,
  validateRelayReplyText,
  decodeRelayAudio,
  knownFactsForContact,
  replyAsksKnownDetail,
  setRelayContactBriefing,
} from "../akif/humanRelay";
import { isBrainOrchestratorEnabled } from "../akif/brainOrchestrator";
import { resendTransportConfigured } from "../auth/resendAuthProvider.ts";
import { isAkifWorkerMediaEnabled } from "../akif/intelligence/workerClient";
import { voiceRepliesEnabled } from "../akif/voiceReply.ts";
import { replySinkEnabled, replySinkSendAllowed } from "../whatsapp/replySink";
import { sendWhatsAppVoiceNote } from "../whatsapp/client";
import { buildHumanRelayDraft, deliverHumanRelayReply } from "./whatsappWebhook";
import { handleChatUi } from "../whatsapp/chatUi";
import { emailRelayTarget, liveEmailRelayEnabled } from "../channels/emailRelayChannel";
import { saveEmailRelayDraft } from "../channels/emailRelayDraftStore";
import { buildRelayEmailPayload, sendRelayEmail } from "../channels/emailOutbound";

const router: IRouter = Router();

const replySchema = z
  .object({
    phone: z.string().min(8).max(280),
    text: z.string().min(1).max(2000).optional(),
    voice: z.boolean().optional(),
    // Dev-made voice note (owner-approved 10 Nov, allowlist only): the dev side
    // renders audio itself and the bot sends it as a WhatsApp voice note, so a
    // dev-side answer costs no TTS provider quota. Ogg/Opus only, 16 MB max.
    audioBase64: z.string().min(8).max(23_000_000).optional(),
    // Pool mode: answer one claimed item instead of every held message for
    // the phone. workerId must own the claim.
    itemId: z.string().min(8).max(80).optional(),
    workerId: z.string().min(1).max(80).optional(),
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

const briefSchema = z
  .object({
    phone: z.string().min(8).max(24),
    text: z.string().max(500),
  })
  .strict();

// Relay-owner briefing for the reply workers about one contact (10 Nov).
// Shown on pending and claim payloads at read time; never sent to customers.
router.post("/akif-relay/brief", (req, res) => {
  if (!writeAuthorized(req, res)) return;
  const parsed = briefSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, error: "invalid_brief" }); return; }
  setRelayContactBriefing(parsed.data.phone, parsed.data.text);
  res.set("Cache-Control", "no-store").json({ ok: true });
});

const docLinkSchema = z
  .object({
    phone: z.string().min(8).max(24),
  })
  .strict();

// Workers issue the secure single-use document link themselves (owner
// direction, 10 Nov): the scripted documents feature sends it, so the KYC/ID/
// bank safety gates (15-minute single-use link, never over chat) stay in code.
router.post("/akif-relay/doclink", async (req, res) => {
  if (!writeAuthorized(req, res)) return;
  const parsed = docLinkSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, error: "invalid_doclink" }); return; }
  try {
    const handled = await handleChatUi(parsed.data.phone, { interactive: { type: "list_reply", list_reply: { id: "udc:documents" } } } as never);
    if (!handled) { res.status(409).json({ ok: false, error: "doclink_unavailable" }); return; }
    res.set("Cache-Control", "no-store").json({ ok: true });
  } catch {
    res.status(502).json({ ok: false, error: "doclink_failed" });
  }
});

const claimSchema = z
  .object({
    workerId: z.string().min(1).max(80),
    // Wake-on-arrival (owner feedback, 10 Nov): hold the call open until an
    // item this worker may take arrives, capped server-side at 30s.
    waitMs: z.number().int().min(0).max(30_000).optional(),
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
    // Whether the registration email OTP transport (Resend) is fully
    // configured; false means codes silently cannot go out (10 Nov OTP rule).
    emailOtp: resendTransportConfigured(),
    // Whether the live mailbox poller is switched on, and why not when off
    // (var missing vs saved empty) - never the password itself.
    emailLiveInbound: liveEmailRelayEnabled(),
    emailLiveInboundVar: typeof process.env.UDC_EMAIL_IMAP_PASS !== "string" ? "missing" : process.env.UDC_EMAIL_IMAP_PASS.length > 0 ? "set" : "empty",
    // Not a secret: which environment name the process actually runs as, so a
    // typo'd or wrong UDC_APP_ENV (the other half of the email gate) is
    // visible without dashboard access.
    appEnv: process.env.UDC_APP_ENV ?? null,
    realSendToRelayNumbers: numbers.filter((n) => replySinkSendAllowed(n)).length,
  });
});

router.get("/akif-relay/pending", (req, res) => {
  if (!readAuthorized(req, res)) return;
  res.set("Cache-Control", "no-store").json({ pending: pendingHumanRelay() });
});

// Email channel: pending review drafts (worker answers, never sent yet).
// The agent polls these, renders each as an image for the owner's preview,
// and only after his yes calls email-send for that exact draft.
router.get("/akif-relay/email-drafts", async (req, res) => {
  if (!readAuthorized(req, res)) return;
  try {
    const { desc, sql } = await import("drizzle-orm");
    const { db, auditLogsTable } = await import("@workspace/db");
    const rows = await db
      .select({ id: auditLogsTable.id, metadata: auditLogsTable.metadata, at: auditLogsTable.createdAt })
      .from(auditLogsTable)
      .where(sql`${auditLogsTable.action} = 'email_relay_draft' and ${auditLogsTable.metadata}->>'state' = 'drafted_not_sent'`)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(20);
    res.set("Cache-Control", "no-store").json({
      drafts: rows.map((row) => ({
        id: row.id,
        to: String(row.metadata?.to ?? ""),
        from: String(row.metadata?.from ?? ""),
        text: String(row.metadata?.text ?? ""),
        at: row.at,
      })),
    });
  } catch {
    res.status(503).json({ ok: false, error: "drafts_unavailable" });
  }
});

// Email channel: send ONE approved draft. Never called automatically - only
// by the agent after the owner's yes on the rendered preview of this exact
// draft. From udc@updowncircle.site only (owner rule, 10 Nov).
router.post("/akif-relay/email-send", async (req, res) => {
  if (!writeAuthorized(req, res)) return;
  const parsed = z.object({ draftId: z.string().uuid() }).strict().safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ ok: false, error: "invalid_body" }); return; }
  try {
    const { desc, sql } = await import("drizzle-orm");
    const { db, auditLogsTable } = await import("@workspace/db");
    const [draft] = await db
      .select({ id: auditLogsTable.id, metadata: auditLogsTable.metadata })
      .from(auditLogsTable)
      .where(sql`${auditLogsTable.id} = ${parsed.data.draftId} and ${auditLogsTable.action} = 'email_relay_draft'`)
      .limit(1);
    if (!draft || draft.metadata?.state !== "drafted_not_sent") {
      res.status(409).json({ ok: false, error: "draft_not_pending" });
      return;
    }
    const to = String(draft.metadata?.to ?? "");
    const text = String(draft.metadata?.text ?? "");
    if (!to || !text.trim()) { res.status(400).json({ ok: false, error: "invalid_draft" }); return; }
    // Thread under the newest live intake from this customer, when one exists.
    const [claim] = await db
      .select({ metadata: auditLogsTable.metadata })
      .from(auditLogsTable)
      .where(sql`${auditLogsTable.action} = 'email_live_claim' and ${auditLogsTable.metadata}->>'from' = ${to}`)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(1);
    const payload = buildRelayEmailPayload(
      { to, text },
      {
        subject: typeof claim?.metadata?.subject === "string" ? claim.metadata.subject : undefined,
        messageId: typeof claim?.metadata?.messageId === "string" ? claim.metadata.messageId : undefined,
        references: Array.isArray(claim?.metadata?.references) ? claim.metadata.references.filter((v): v is string => typeof v === "string") : undefined,
      },
    );
    const { id } = await sendRelayEmail(payload, { apiKey: process.env.RESEND_API_KEY ?? "" });
    await db.execute(sql`update audit_logs set metadata = metadata || ${JSON.stringify({ state: "sent", sentAt: new Date().toISOString(), resendId: id })}::jsonb where id = ${parsed.data.draftId}`);
    res.set("Cache-Control", "no-store").json({ ok: true, sent: true, resendId: id });
  } catch {
    res.status(502).json({ ok: false, error: "email_send_failed" });
  }
});

// Pool mode (owner direction, 10 Nov): parallel reply workers claim the
// oldest answerable held item. Claims are exclusive for a few minutes and
// ordered per phone, so two workers never answer the same message and one
// phone never gets parallel replies.
router.post("/akif-relay/claim", async (req, res) => {
  if (!writeAuthorized(req, res)) return;
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, error: "invalid_claim" }); return; }
  const item = await claimHumanRelayWithWait(parsed.data.workerId, parsed.data.waitMs ?? 0);
  res.set("Cache-Control", "no-store").json({ ok: true, item: item ?? null });
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
  // A phone-only reply must not race a worker's active claim on that number:
  // the worker's answer and this one would both go out (10 Nov launch).
  const stickyOwner = stickyWorkerFor(phone);
  if (!parsed.data!.itemId && stickyOwner && stickyOwner !== (parsed.data!.workerId ?? "")) {
    res.status(409).json({ ok: false, error: "customer_owned", detail: `${stickyOwner} owns this customer right now` });
    return;
  }
  if (!parsed.data!.itemId && hasActiveHumanRelayClaim(phone)) {
    res.status(409).json({ ok: false, error: "claim_lost" });
    return;
  }
  // One voice per contact (owner direction, 10 Nov): a reply went out for
  // this phone moments ago, so a second send right now would read as two
  // people answering. The worker retries after the short window.
  if (relayReplyCooldownActive(phone, parsed.data!.workerId ?? undefined, Date.now(), !parsed.data!.itemId)) {
    res.status(409).json({ ok: false, error: "reply_cooldown" });
    return;
  }
  // Validate the claim BEFORE anything goes out (10 Nov voice+text double
  // send): a stale or lost claim must stop the send, not just the bookkeeping.
  if (parsed.data!.itemId && !relayClaimStillValid(parsed.data!.itemId, parsed.data!.workerId ?? "")) {
    res.status(409).json({ ok: false, error: "claim_lost" });
    return;
  }
  // Thread continuity guard (owner direction, 10 Nov): no restarts with a
  // generic opener and no repeats of a line the chat already used.
  if (text && relayReplyResetsConversation(phone, text)) {
    res.status(409).json({ ok: false, error: "reply_resets_conversation", detail: "Continue the thread from its last topic instead of restarting, and never repeat a recent line." });
    return;
  }
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
  // Memory guard (owner direction, 10 Nov): never ask for something the
  // customer already answered in this thread. The worker rewrites it as a
  // statement instead.
  if (text) {
    const asks = replyAsksKnownDetail(text, knownFactsForContact(phone));
    if (asks) {
      res.status(409).json({ ok: false, error: "asks_known_detail", detail: asks });
      return;
    }
  }
  // Email channel (Phase A, synthetic only): the answer is saved as a
  // review draft, never sent. Voice does not apply to email.
  const emailTo = emailRelayTarget(phone);
  if (emailTo && text === null) {
    res.status(400).json({ ok: false, error: "invalid_reply" });
    return;
  }
  // Never mark a message answered with nothing sent (owner, 10 Nov): a text
  // reply must carry real words.
  if (!emailTo && !audio && !(text && text.trim())) {
    res.status(400).json({ ok: false, error: "invalid_reply" });
    return;
  }
  const delivery = emailTo
    ? await saveEmailRelayDraft({ to: emailTo, text: text ?? "" })
    : audio
    ? await sendWhatsAppVoiceNote(phone, audio)
    : await deliverHumanRelayReply(phone, text!, {
        voice,
        heardLanguage: lastHeardLanguageFor(phone),
      });
  if (!delivery.delivered) {
    res.status(502).json({ ok: false, error: "delivery_failed", reason: delivery.reason });
    return;
  }
  if (parsed.data!.itemId) {
    const answeredItem = answerClaimedHumanRelayItem(parsed.data!.itemId, parsed.data!.workerId ?? "", text ?? (audio ? "[voice note]" : undefined));
    if (!answeredItem) { res.status(409).json({ ok: false, error: "claim_lost" }); return; }
    res.set("Cache-Control", "no-store").json({ ok: true, delivered: true, answered: 1 });
    return;
  }
  noteHumanRelayReplySent(phone, parsed.data!.workerId ?? undefined, text ?? (audio ? "[voice note]" : undefined));
  const answered = markHumanRelayAnswered(phone, text ?? (audio ? "[voice note]" : undefined));
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
  // Skip releases the worker's claim back to the pool; it never marks a
  // message answered (owner direction, 10 Nov: a skipped voice note must
  // reach a voice worker, never vanish).
  const released = releaseHumanRelayClaim(parsed.data.phone);
  res.set("Cache-Control", "no-store").json({ ok: true, released });
});

// Dismiss (owner direction, 10 Nov): mark an item handled WITHOUT any reply -
// for spam/vendor mail that reached the queue. Unlike skip it never returns
// the item to the pool.
router.post("/akif-relay/dismiss", (req, res) => {
  if (!writeAuthorized(req, res)) return;
  const parsed = z.object({ phone: z.string().min(3).max(120), itemId: z.string().uuid().optional(), workerId: z.string().min(1).max(80).optional(), reason: z.string().max(200).optional() }).strict().safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ ok: false, error: "invalid_dismiss" }); return; }
  if (!humanRelayActiveFor(parsed.data.phone)) { res.status(403).json({ ok: false, error: "number_not_relay_allowlisted" }); return; }
  if (parsed.data.itemId) {
    const done = answerClaimedHumanRelayItem(parsed.data.itemId, parsed.data.workerId ?? "", parsed.data.reason ?? "dismissed");
    if (!done) { res.status(409).json({ ok: false, error: "claim_lost" }); return; }
    res.set("Cache-Control", "no-store").json({ ok: true, dismissed: 1 });
    return;
  }
  const dismissed = markHumanRelayAnswered(parsed.data.phone, parsed.data.reason ?? "dismissed");
  res.set("Cache-Control", "no-store").json({ ok: true, dismissed });
});

export default router;

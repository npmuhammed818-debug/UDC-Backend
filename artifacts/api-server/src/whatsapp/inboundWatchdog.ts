import { logger } from "../lib/logger";
import { runBackgroundTask } from "../lib/backgroundTask";
import { runFreeChain } from "../akif/intelligence/freeProviderChain";
import { accountFactsLine } from "../akif/fallbackContext";
import { sendWhatsAppText } from "./client";
import { pendingInbound, noteInboundForWatchdog } from "./inboundWatchdogState";
import { noteHumanRelayReplySent, pendingHumanRelay } from "../akif/humanRelay";

// Owner rule (30s): a customer message with no answer after 30 seconds gets a
// fresh, human, non-repetitive reply from the server itself, never silence.
const ANSWER_DEADLINE_MS = 30_000;
const GIVE_UP_MS = 10 * 60_000;
const SWEEP_MS = 5_000;

const SYSTEM = [
  "You are the assistant of UpdownCircle, a trade platform on WhatsApp.",
  "Reply to the customer's latest message in one or two short, warm, human sentences.",
  "Never use dashes or bullet lists. Do not repeat a question you may have asked before.",
  "Move the conversation forward with one useful next step. Do not promise prices, money, or approvals.",
].join(" ");

const FALLBACK_TEXT = "Thanks for your message, I have it. Give me a moment and I will come back to you properly on this.";
const FALLBACK_MEDIA = "Thank you, I have received that. I am looking at it now and will update you shortly.";

let started = false;
let sweeping = false;
const lastIntervention = new Map<string, number>();

export async function sweepUnanswered(now = Date.now()) {
  if (sweeping) return;
  sweeping = true;
  try {
    for (const [id, p] of [...pendingInbound]) {
      const age = now - p.at;
      if (age > GIVE_UP_MS) { pendingInbound.delete(id); continue; }
      if (age < ANSWER_DEADLINE_MS) continue;
      pendingInbound.delete(id); // exactly one intervention per message
      if (now - (lastIntervention.get(p.phone) ?? 0) < 20_000) continue;
      lastIntervention.set(p.phone, now);
      let reply = p.kind === "text" ? FALLBACK_TEXT : FALLBACK_MEDIA;
      let source = "scripted";
      if (p.kind === "text" && p.text.trim()) {
        const r = await runFreeChain(p.text, SYSTEM + await accountFactsLine(p.phone), () => 12_000).catch(() => null);
        if (r?.content) { reply = r.content.replace(/\s[-\u2013\u2014]\s/g, ", "); source = r.provider; }
      }
      try {
        await sendWhatsAppText(p.phone, reply);
        // The held queue item stays open for a human, but the bot line is recorded so a worker sees what the customer already received and the repeat guard knows it.
        noteHumanRelayReplySent(p.phone, "watchdog", reply);
        logger.warn({ flow: "inbound_watchdog", ageMs: age, kind: p.kind, source, phoneTail: p.phone.slice(-4) }, "watchdog_intervention");
      } catch (error) {
        logger.error({ flow: "inbound_watchdog", reason: error instanceof Error ? error.name : "send_failed" }, "watchdog_send_failed");
      }
    }
  } finally {
    sweeping = false;
  }
}

export function startInboundWatchdog() {
  if (started) return;
  started = true;
  const timer = setInterval(() => runBackgroundTask(() => sweepUnanswered(), () => logger.warn("inbound watchdog sweep failed")), SWEEP_MS);
  timer.unref();
}

const RESTORE_MAX_AGE_MS = 2 * 60_000;

/** After a restart the in-memory pending map is empty. Held relay items are persisted and restored first, so
 *  re-register the ones from the last two minutes: their 30 second answer was in flight when the process stopped.
 *  Older open items are left alone (the watchdog already had its chance, and a repeat would double reply). */
export function restoreWatchdogFromRelay(now = Date.now()): number {
  let n = 0;
  for (const item of pendingHumanRelay()) {
    const age = now - Date.parse(item.at);
    if (!Number.isFinite(age) || age < 0 || age > RESTORE_MAX_AGE_MS) continue;
    noteInboundForWatchdog(item.phone, `restored:${item.id}`, item.kind === "voice" ? "audio" : "text", item.kind === "voice" ? "" : item.text);
    const p = pendingInbound.get(`restored:${item.id}`);
    if (p) p.at = Math.max(Date.parse(item.at), now - RESTORE_MAX_AGE_MS);
    n++;
  }
  return n;
}

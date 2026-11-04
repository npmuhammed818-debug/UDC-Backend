import { createHash } from "node:crypto";

// Per-phone inbound cap (in memory, per process). Default 20 messages per rolling minute; override with
// WHATSAPP_INBOUND_PER_MINUTE. Over the cap the message is not processed (no AI call, no reply storm), and the
// sender gets one short notice per window. Only a hash of the phone is held in memory.
const WINDOW_MS = 60_000;
const hits = new Map<string, { times: number[]; noticed: number }>();
const key = (phone: string) => createHash("sha256").update("wa-rate:" + phone).digest("hex");
export const resetInboundCapForTest = () => hits.clear();

export function checkInboundCap(phone: string, now = Date.now()): "ok" | "notice" | "drop" {
  const limit = Math.max(1, Number(process.env.WHATSAPP_INBOUND_PER_MINUTE) || 20);
  if (hits.size > 5000) { for (const [k, v] of hits) if (!v.times.length || now - v.times[v.times.length - 1]! > WINDOW_MS) hits.delete(k); }
  const k = key(phone);
  const entry = hits.get(k) ?? { times: [], noticed: 0 };
  entry.times = entry.times.filter((t) => now - t < WINDOW_MS);
  hits.set(k, entry);
  if (entry.times.length < limit) { entry.times.push(now); return "ok"; }
  if (now - entry.noticed >= WINDOW_MS) { entry.noticed = now; return "notice"; }
  return "drop";
}
export const INBOUND_CAP_NOTICE = "You are sending messages very quickly. Please wait a minute, then send your message again.";

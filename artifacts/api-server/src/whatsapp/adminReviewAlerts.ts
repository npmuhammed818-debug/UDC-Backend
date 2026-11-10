import { sendWhatsAppText } from "./client.ts";

/** Owner review alerts (owner direction, 10 Nov launch): each new pending
 *  approval (agent registration, company verification, offer/match, referral)
 *  pings the owner's own number from the live bot. Short and plain, type and
 *  first name only, never customer contact details or trade data. Events in
 *  a short window collapse into one summary so a burst stays one message.
 *  Disabled unless UDC_ADMIN_ALERT_PHONE is set. */

type Pending = { kind: string; name?: string };
const pending: Pending[] = [];
let timer: NodeJS.Timeout | null = null;

const ownerPhone = () => (process.env.UDC_ADMIN_ALERT_PHONE ?? "").replace(/\D/g, "");
const windowMs = () => Math.max(1000, Number(process.env.UDC_ADMIN_ALERT_WINDOW_MS ?? 45000) || 45000);

const line = ({ kind, name }: Pending) => (name ? `${kind} (${name})` : kind);

async function flush(send: (to: string, body: string) => Promise<unknown> = sendWhatsAppText) {
  timer = null;
  const items = pending.splice(0, pending.length);
  const phone = ownerPhone();
  if (!items.length || !phone) return;
  const body = items.length === 1
    ? `New review waiting: ${line(items[0])}. Details in the admin panel.`
    : `${items.length} new reviews waiting: ${items.map(line).join(", ")}. Details in the admin panel.`;
  try { await send(phone, body); } catch { console.warn("admin review alert failed", { reason: "send_failed" }); }
}

/** Fire-and-forget; never throws, never blocks the customer flow. */
export function queueAdminReviewAlert(kind: string, name?: string) {
  if (!ownerPhone()) return;
  pending.push({ kind, name: name?.trim().slice(0, 60) || undefined });
  if (!timer) { timer = setTimeout(() => void flush(), windowMs()); timer.unref?.(); }
}

/** Test seam: flush now with an injected sender, inspect and reset the buffer. */
export const adminReviewAlertTest = {
  flush,
  size: () => pending.length,
  reset: () => { pending.length = 0; if (timer) { clearTimeout(timer); timer = null; } },
};

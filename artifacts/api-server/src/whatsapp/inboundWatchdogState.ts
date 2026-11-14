// Pending inbound customer messages that have not been answered yet.
// Memory only: a restart loses at most the last few seconds of tracking, and
// the durable claim retry already protects the message itself.
export type PendingInbound = { phone: string; id: string; kind: string; text: string; at: number };
export const pendingInbound = new Map<string, PendingInbound>();
const CAP = 500;

export function noteInboundForWatchdog(phone: string | undefined, id: string, kind: string, text: string): void {
  if (!phone || kind === "reaction") return;
  if (pendingInbound.size >= CAP) {
    const oldest = pendingInbound.keys().next().value;
    if (oldest) pendingInbound.delete(oldest);
  }
  pendingInbound.set(id, { phone, id, kind, text: text.slice(0, 1500), at: Date.now() });
}

/** Any real outbound message (not a reaction) to this phone answers what was pending. */
export function noteOutboundForWatchdog(phone: string): void {
  for (const [id, p] of pendingInbound) if (p.phone === phone) pendingInbound.delete(id);
}

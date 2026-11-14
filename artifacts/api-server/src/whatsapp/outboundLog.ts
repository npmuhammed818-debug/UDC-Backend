// In-memory map of our own outbound message ids to the line we sent, so an
// inbound reply that quotes one of our messages can show the reply worker
// exactly which line the customer quoted (owner feedback, 10 Nov: workers
// looked confused when a customer answered a bot line by quoting it).
// Memory only, capped; a restart just loses resolution and the claim payload
// falls back to the thread history, which already carries recent bot lines.
const entries = new Map<string, { phone: string; text: string; at: number }>();
const CAP = 500;

export function recordOutboundMessage(messageId: string | undefined, phone: string, text: string): void {
  if (!messageId) return;
  if (!entries.has(messageId) && entries.size >= CAP) {
    const oldest = entries.keys().next().value;
    if (oldest) entries.delete(oldest);
  }
  entries.set(messageId, { phone, text: text.slice(0, 500), at: Date.now() });
}

/** The line we sent under this provider message id, only for the same phone. */
export function quotedOutboundFor(messageId: string | undefined, phone: string): string | undefined {
  if (!messageId) return undefined;
  const hit = entries.get(messageId);
  return hit && hit.phone === phone ? hit.text : undefined;
}

export function resetOutboundLogForTest(): void {
  entries.clear();
}

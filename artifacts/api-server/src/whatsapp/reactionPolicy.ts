// Pure policy: at most one emoji reaction per meaningful beat, never per message.
export type ReactionBeat = "ack" | "complete" | "milestone";

const EMOJI: Record<ReactionBeat, string> = { ack: "\u{1F440}", complete: "\u2705", milestone: "\u{1F389}" };
const MIN_GAP_MS = 20_000;

export type ReactionMemory = Map<string, { at: number; beat: ReactionBeat }>;

/**
 * Returns the emoji to react with, or null. One reaction per inbound message id,
 * and a minimum gap per phone so a chatty burst never gets an emoji on each line.
 */
export function chooseReaction(
  beat: ReactionBeat,
  inboundMessageId: string | null | undefined,
  phone: string,
  memory: ReactionMemory,
  now = Date.now(),
): string | null {
  if (!inboundMessageId || !/^wamid\./.test(inboundMessageId) || !phone) return null;
  const used = memory.get(`m:${inboundMessageId}`);
  if (used) return null;
  const last = memory.get(`p:${phone}`);
  if (last && now - last.at < MIN_GAP_MS && beat !== "milestone") return null;
  memory.set(`m:${inboundMessageId}`, { at: now, beat });
  memory.set(`p:${phone}`, { at: now, beat });
  if (memory.size > 2000) for (const k of [...memory.keys()].slice(0, 1000)) memory.delete(k);
  return EMOJI[beat];
}

import { chooseReaction, type ReactionBeat, type ReactionMemory } from "./reactionPolicy.ts";
import { sendWhatsAppReaction } from "./client.ts";

const memory: ReactionMemory = new Map();

/** Fire-and-forget; never throws and never blocks the reply. Off unless UDC_WHATSAPP_REACTIONS=on. */
export function react(beat: ReactionBeat, phone: string, inboundMessageId: string | null | undefined): void {
  if (process.env["UDC_WHATSAPP_REACTIONS"] !== "on") return;
  const emoji = chooseReaction(beat, inboundMessageId, phone, memory);
  if (!emoji || !inboundMessageId) return;
  void sendWhatsAppReaction(phone, inboundMessageId, emoji).catch(() => undefined);
}

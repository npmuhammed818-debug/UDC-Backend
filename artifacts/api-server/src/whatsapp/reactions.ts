import { chooseReaction, type ReactionBeat, type ReactionMemory } from "./reactionPolicy.ts";
import { sendWhatsAppReaction } from "./client.ts";
import { chooseAiReaction } from "./aiReaction.ts";

const memory: ReactionMemory = new Map();

/** Fire-and-forget; never throws and never blocks the reply. Off unless UDC_WHATSAPP_REACTIONS=on. */
export function react(beat: ReactionBeat, phone: string, inboundMessageId: string | null | undefined): void {
  if (process.env["UDC_WHATSAPP_REACTIONS"] !== "on") return;
  const emoji = chooseReaction(beat, inboundMessageId, phone, memory);
  if (!emoji || !inboundMessageId) return;
  void sendWhatsAppReaction(phone, inboundMessageId, emoji).catch(() => undefined);
}

/** AI-chosen reaction for a plain text message. Fire-and-forget; off unless both flags are on. Shares the one-per-message and 20s-gap policy. */
export function reactByMeaning(phone: string, inboundMessageId: string | null | undefined, text: string | undefined | null): void {
  if (process.env["UDC_WHATSAPP_REACTIONS"] !== "on" || process.env["UDC_WHATSAPP_AI_REACTIONS"] !== "on") return;
  void (async () => {
    const emoji = await chooseAiReaction(text);
    if (!emoji || !inboundMessageId) return;
    if (!chooseReaction("ack", inboundMessageId, phone, memory)) return; // gate only; the AI emoji is used
    await sendWhatsAppReaction(phone, inboundMessageId, emoji);
  })().catch(() => undefined);
}

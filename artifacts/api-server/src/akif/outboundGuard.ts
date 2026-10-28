// Last line of defense before anything reaches a customer: an AI draft must never carry
// unresolved placeholder markers (for example "<link1>" or "[link]"). When one is found the
// whole reply is replaced with the honest fallback - a half-masked draft is worse than none.
import { AI_FALLBACK_REPLY } from "./conversationPolicy.ts";

// Angle or square brackets wrapping anything that looks like a template slot: a bare token
// (<link1>), or a short label holding a slot word ([Upload Link], <your link here>). Curly
// braces with a slot word too. Ordinary punctuation and "<3" never match.
const SLOT_WORD = /link|url|file|document|photo|video|audio|voice|number|code|name|date|amount|price|phone|address|id|token|key/i;
const PLACEHOLDER = new RegExp(
  "<\\s*[a-z][a-z0-9_ ]{0,28}\\d?\\s*\\/?>|" +
  "\\[[^\\]\\n]{0,40}(?:" + SLOT_WORD.source + ")[^\\]\\n]{0,15}\\]|" +
  "\\{[^}\\n]{0,30}(?:" + SLOT_WORD.source + ")[^}\\n]{0,10}\\}", "i");

export function hasUnresolvedPlaceholder(text: string | null | undefined): boolean {
  return typeof text === "string" && PLACEHOLDER.test(text);
}

/** The text safe to send, and whether a replacement happened (for a safe, content-free log). */
export function guardOutboundText(text: string): { text: string; replaced: boolean } {
  return hasUnresolvedPlaceholder(text) ? { text: AI_FALLBACK_REPLY, replaced: true } : { text, replaced: false };
}

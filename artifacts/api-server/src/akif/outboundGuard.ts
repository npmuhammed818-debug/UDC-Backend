// Last line of defense before anything reaches a customer: an AI draft must never carry
// unresolved placeholder markers (for example "<link1>" or "[link]"). When one is found the
// whole reply is replaced with the honest fallback - a half-masked draft is worse than none.
import { AI_FALLBACK_REPLY } from "./conversationPolicy.ts";

const PLACEHOLDER = /<[a-z][a-z0-9_-]*\d*\s*\/?>|\[(?:link|url|name|date|amount|number|phone)\d*\]|\{(?:link|url|name|date|amount)\d*\}/i;

export function hasUnresolvedPlaceholder(text: string | null | undefined): boolean {
  return typeof text === "string" && PLACEHOLDER.test(text);
}

/** The text safe to send, and whether a replacement happened (for a safe, content-free log). */
export function guardOutboundText(text: string): { text: string; replaced: boolean } {
  return hasUnresolvedPlaceholder(text) ? { text: AI_FALLBACK_REPLY, replaced: true } : { text, replaced: false };
}

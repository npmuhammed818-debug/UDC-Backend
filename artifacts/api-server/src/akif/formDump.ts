// Form-dump guard (owner rule, 8 Nov): AKIF chats like a person. It must never
// answer a greeting or small talk with a stack of registration fields to fill
// in. Asking for several details is only natural once the customer has shown
// they want to register, buy, sell or trade.
const FIELD_ASKS: Array<[RegExp, string]> = [
  [/\bname\b/i, "name"],
  [/e-?mail/i, "email"],
  [/company|business/i, "company"],
  [/country/i, "country"],
  [/registration (number|id)/i, "registration_number"],
];
const ASKING_WORDS = /shar(e|ing)|provide|send|tell|give|let me know|fill|\bneed\b|\?/i;
const LIST_ITEM = /^\s*(?:\d+[.)]|[-•*])/;
const TRADE_INTENT = /regist|sign[ -]?up|join|trad|buy|sell|offer|requirement|import|export|\bdeal|agent|supplier|buyer|seller|verif|document|upload|vault/i;

// Counts distinct registration details a reply asks for: in asking sentences
// and in numbered/bulleted list items. AKIF asks ONE thing at a time, so 2 or
// more is a form dump - with or without trade intent (owner rule, 8 Nov).
export function formDumpFields(reply: string): number {
  const found = new Set<string>();
  for (const sentence of reply.split(/(?<=[.!?])\s+/)) {
    if (!ASKING_WORDS.test(sentence)) continue;
    for (const [re, key] of FIELD_ASKS) if (re.test(sentence)) found.add(key);
  }
  for (const line of reply.split("\n")) {
    if (!LIST_ITEM.test(line)) continue;
    for (const [re, key] of FIELD_ASKS) if (re.test(line)) found.add(key);
  }
  return found.size;
}

export function hasTradeIntent(text: string, history: Array<{ role: string; content: string }>): boolean {
  if (TRADE_INTENT.test(text)) return true;
  return history.some((h) => h.role === "user" && TRADE_INTENT.test(h.content));
}

// Deterministic floor when the model keeps dumping fields after one correction.
export const FORM_DUMP_FALLBACK = "Hi! Happy to chat. What can I help you with today?";
export const FORM_DUMP_FALLBACK_INTENT = "Happy to help - let's take it one step at a time. What would you like to start with?";
// Second consecutive floor: admit the stumble instead of parroting the same
// line (owner saw the floor loop on his live test, 8 Nov).
export const FORM_DUMP_FALLBACK_RETRY = "Sorry, I'm not handling this chat well. Tell me in a few words what you need, and I'll take it one step at a time.";

/** Relay-draft guard: the no-tools conversation fallback never passes the
 *  brain's own validators, so a raw fallback reply can be a form dump (seen
 *  live, 10 Nov). Same rule as the brain: one thing at a time, or the floor. */
export function fixFormDumpReply(reply: string, customerText: string): string {
  if (formDumpFields(reply) < 2) return reply;
  console.warn("AKIF relay fallback draft was a form dump; using the floor", { reason: "form_dump_guard" });
  return hasTradeIntent(customerText, []) ? FORM_DUMP_FALLBACK_INTENT : FORM_DUMP_FALLBACK;
}

import { createHmac, timingSafeEqual } from "node:crypto";

// Staging-only reply sink. With AKIF_WHATSAPP_REPLY_SINK=store, outbound WhatsApp messages are NOT sent to
// Meta. They are kept in memory (last 300, lost on restart) so simulated users can be tested safely and the
// bot's replies can be read. Default (flag unset) changes nothing: replies are sent as before.
const MAX = 300;
export type SunkReply = { n: number; at: string; to: string; kind: string; text: string };
const entries: SunkReply[] = [];
let counter = 0;

export const replySinkEnabled = (env: NodeJS.ProcessEnv = process.env) => env.AKIF_WHATSAPP_REPLY_SINK === "store";

function describe(body: any): { kind: string; text: string } {
  const type = typeof body?.type === "string" ? body.type : "unknown";
  if (type === "text") return { kind: "text", text: String(body.text?.body ?? "") };
  if (type === "interactive") {
    const i = body.interactive ?? {};
    const buttons = Array.isArray(i.action?.buttons) ? ` [buttons: ${i.action.buttons.map((b: any) => b?.reply?.title).join(" | ")}]` : "";
    return { kind: `interactive:${i.type ?? "?"}`, text: String(i.body?.text ?? "") + buttons };
  }
  if (type === "audio") return { kind: "voice", text: "[voice note]" };
  return { kind: type, text: `[${type}]` };
}

export function recordSunkReply(to: string, body: unknown): { id: string } {
  const { kind, text } = describe(body);
  const entry = { n: ++counter, at: new Date().toISOString(), to: String(to), kind, text: text.slice(0, 4096) };
  entries.push(entry);
  if (entries.length > MAX) entries.shift();
  return { id: `sink-${entry.n}` };
}

export const readSunkReplies = (to?: string, sinceN = 0) => entries.filter(e => e.n > sinceN && (!to || e.to === to));
export const clearSunkReplies = () => { entries.length = 0; };

/** Reading requires a signature made with the staging app secret over "read-sink", the same secret the simulator holds. */
export function sinkReadAuthorized(signature: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update("read-sink").digest("hex"));
  const given = Buffer.from(signature.slice(7));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { sendWhatsAppText } from "../src/whatsapp/client.ts";
const f = globalThis.fetch;
afterEach(() => { globalThis.fetch = f; });
function cfg() { process.env.WHATSAPP_ACCESS_TOKEN = "t"; process.env.WHATSAPP_PHONE_NUMBER_ID = "1"; }
test("a timeout is reported as an unknown outcome and is not retried", async () => {
  cfg(); let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new DOMException("timed out", "TimeoutError"); }) as typeof fetch;
  const r = await sendWhatsAppText("recipient", "hello") as any;
  assert.equal(r.delivered, false); assert.equal(r.reason, "provider_outcome_unknown"); assert.equal(calls, 1);
});
test("a 502 from Meta is an unknown outcome, not a rejection", async () => {
  cfg(); let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("bad gateway", { status: 502 }); }) as typeof fetch;
  const r = await sendWhatsAppText("recipient", "hello") as any;
  assert.equal(r.reason, "provider_outcome_unknown"); assert.equal(calls, 1);
});
import { unknownOutboundAt } from "../src/whatsapp/inboundWatchdogState.ts";
test("an unknown outcome marks the phone so the watchdog adds no second automatic line; a delivered send does not", async () => {
  cfg(); unknownOutboundAt.clear();
  globalThis.fetch = (async () => { throw new DOMException("timed out", "TimeoutError"); }) as typeof fetch;
  await sendWhatsAppText("15550009771", "hello");
  assert.ok(unknownOutboundAt.has("15550009771"));
  globalThis.fetch = (async () => Response.json({ messages: [{ id: "w" }] })) as typeof fetch;
  await sendWhatsAppText("15550009772", "hello");
  assert.ok(!unknownOutboundAt.has("15550009772"));
});

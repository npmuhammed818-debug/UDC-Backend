import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { sendWhatsAppText, sendWhatsAppInteractive, sendWhatsAppDocument, sendWhatsAppImage, sendWhatsAppReaction, sendWhatsAppVoiceNote, markRead, markReadAndTyping } from "../src/whatsapp/client.ts";
import { sendWhatsAppNotification } from "../src/whatsapp/notificationTransport.ts";
import { outboundAllowed } from "../src/whatsapp/outboundScope.ts";

const saved = { f: globalThis.fetch, t: process.env.WHATSAPP_ACCESS_TOKEN, p: process.env.WHATSAPP_PHONE_NUMBER_ID, s: process.env.UDC_WHATSAPP_ONLY_TO, ty: process.env.UDC_WHATSAPP_TYPING };
const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
afterEach(() => {
  globalThis.fetch = saved.f;
  restore("WHATSAPP_ACCESS_TOKEN", saved.t); restore("WHATSAPP_PHONE_NUMBER_ID", saved.p);
  restore("UDC_WHATSAPP_ONLY_TO", saved.s); restore("UDC_WHATSAPP_TYPING", saved.ty);
});
const setup = () => { process.env.WHATSAPP_ACCESS_TOKEN = "tok"; process.env.WHATSAPP_PHONE_NUMBER_ID = "123"; process.env.UDC_WHATSAPP_ONLY_TO = "+91 79941 33604"; process.env.UDC_WHATSAPP_TYPING = "on"; };

test("scope helper: unset allows all, set allows only listed digits", () => {
  assert.equal(outboundAllowed("359888804562", {}), true);
  assert.equal(outboundAllowed("359888804562", { UDC_WHATSAPP_ONLY_TO: "917994133604" }), false);
  assert.equal(outboundAllowed("+917994133604", { UDC_WHATSAPP_ONLY_TO: "917994133604" }), true);
  assert.equal(outboundAllowed("", { UDC_WHATSAPP_ONLY_TO: "917994133604" }), false);
});

test("scope on: no Meta request of any kind for another number", async () => {
  setup(); let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({messages:[{id:"x"}]}); }) as typeof fetch;
  const other = "359888804562";
  const results = [
    await sendWhatsAppText(other, "hi"),
    await sendWhatsAppInteractive(other, { type: "button", body: { text: "b" }, action: { buttons: [{ type: "reply", reply: { id: "a", title: "A" } }] } } as never),
    await sendWhatsAppDocument(other, "https://example.com/a.pdf", "a.pdf"),
    await sendWhatsAppImage(other, "https://example.com/a.png"),
    await sendWhatsAppReaction(other, "wamid.x", "👍"),
    await sendWhatsAppVoiceNote(other, new Uint8Array([1, 2, 3])),
    await sendWhatsAppNotification({ phone: other, body: "x", freeForm: true } as never, { env: { ...process.env, UDC_SHIPMENT_WHATSAPP_SEND_ENABLED: "true" } as never, transport: (async () => { calls++; return new Response("{}"); }) as never } as never),
  ];
  markRead(other, "wamid.y"); markReadAndTyping(other, "wamid.y");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, 0);
  for (const r of results) assert.equal((r as { delivered: boolean }).delivered, false);
});

test("scope on: the allowed number still gets messages", async () => {
  setup(); let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({messages:[{id:"wamid.ok1"}]}); }) as typeof fetch;
  assert.deepEqual(await sendWhatsAppText("917994133604", "hi"), { delivered: true, messageId: "wamid.ok1" });
  assert.ok(calls >= 1);
});

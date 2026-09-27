import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { checkWhatsAppConnection, sendWhatsAppDocument, sendWhatsAppText } from "../src/whatsapp/client.ts";

const originalFetch = globalThis.fetch;
const token = process.env.WHATSAPP_ACCESS_TOKEN;
const phone = process.env.WHATSAPP_PHONE_NUMBER_ID;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (token === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
  else process.env.WHATSAPP_ACCESS_TOKEN = token;
  if (phone === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  else process.env.WHATSAPP_PHONE_NUMBER_ID = phone;
});
function configure() {
  process.env.WHATSAPP_ACCESS_TOKEN = " test-token ";
  process.env.WHATSAPP_PHONE_NUMBER_ID = " 123 ";
}
test("missing configuration never calls Meta", async () => {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  globalThis.fetch = async () => { throw new Error("must not call"); };
  assert.deepEqual(await sendWhatsAppText("recipient", "hello"), { delivered: false, reason: "not_configured" });
  assert.deepEqual(await checkWhatsAppConnection(), { ok: false, reason: "not_configured" });
});
test("normalizes credentials and bounds outgoing request time", async () => {
  configure();
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://graph.facebook.com/v21.0/123/messages");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-token");
    assert.ok(init?.signal);
    assert.equal(JSON.parse(String(init?.body)).text.body, "hello");
    return new Response("{}", { status: 200 });
  };
  assert.deepEqual(await sendWhatsAppText("recipient", "hello"), { delivered: true });
});
test("provider rejection preserves numeric diagnosis without leaking response data", async () => {
  configure();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 190, error_subcode: 463, message: "private-token-and-phone" } }), { status: 401 });
  await assert.rejects(sendWhatsAppText("recipient", "hello"), { message: "whatsapp_delivery_failed http=401 code=190 subcode=463" });
  assert.deepEqual(await checkWhatsAppConnection(), { ok: false, reason: "meta_rejected_credentials_or_phone", httpStatus: 401, code: 190, subcode: 463 });
});
test("credential probe uses a read and does not claim delivery", async () => {
  configure();
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://graph.facebook.com/v21.0/123?fields=id");
    assert.equal(init?.body, undefined);
    assert.equal(init?.method, undefined);
    return new Response('{"id":"123"}');
  };
  assert.deepEqual(await checkWhatsAppConnection(), { ok: true, scope: "phone_number_access_only" });
});
test("network failures and non-JSON rejections are safe to report", async () => {
  configure();
  globalThis.fetch = async () => { throw new Error("private-network-details"); };
  assert.deepEqual(await checkWhatsAppConnection(), { ok: false, reason: "meta_unreachable_or_timeout" });
  globalThis.fetch = async () => new Response("private proxy response", { status: 502 });
  await assert.rejects(sendWhatsAppText("recipient", "hello"), { message: "whatsapp_delivery_failed http=502 code=unknown subcode=none" });
});


test("sends stored deal documents as WhatsApp documents without exposing internal paths", async () => {
  configure();
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://graph.facebook.com/v21.0/123/messages");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.type, "document");
    assert.equal(body.document.link, "https://signed.example.test/loi.pdf");
    assert.equal(body.document.filename, "LOI.pdf");
    assert.equal(body.document.caption, "UDC LOI document");
    assert.doesNotMatch(JSON.stringify(body), /storage:\/\//i);
    return new Response(JSON.stringify({ messages: [{ id: "wamid-doc-1" }] }), { status: 200 });
  };

  assert.deepEqual(
    await sendWhatsAppDocument(
      "recipient",
      "https://signed.example.test/loi.pdf",
      "LOI.pdf",
      "UDC LOI document",
    ),
    { delivered: true, messageId: "wamid-doc-1" },
  );
});

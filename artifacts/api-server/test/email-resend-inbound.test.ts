import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createEmailResendInboundRouter,
  resendEmailToParsedMail,
  verifyResendWebhookSignature,
} from "../src/routes/emailResendInbound.ts";
import { processLiveEmailMessage } from "../src/channels/emailLiveInbound.ts";
import {
  __setRelayPersistenceForTests,
  resetHumanRelay,
} from "../src/akif/humanRelay.ts";

const SECRET = "whsec_" + Buffer.from("resend-inbound-test-secret-key-32b").toString("base64");
const ENV = {
  UDC_APP_ENV: "staging",
  RESEND_WEBHOOK_SECRET: SECRET,
  RESEND_API_KEY: "re_test_key",
  SESSION_SECRET: "x".repeat(40),
} as NodeJS.ProcessEnv;

function sign(rawBody: string, id: string, timestamp: string): string {
  const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return `v1,${sig}`;
}

test("svix signature verification accepts a valid signature and rejects tampering", () => {
  const body = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });
  const now = Math.floor(Date.now() / 1000);
  const ts = String(now);
  const good = sign(body, "msg_1", ts);
  assert.equal(verifyResendWebhookSignature(body, { id: "msg_1", timestamp: ts, signature: good }, SECRET, now), true);
  assert.equal(verifyResendWebhookSignature(body + " ", { id: "msg_1", timestamp: ts, signature: good }, SECRET, now), false);
  assert.equal(verifyResendWebhookSignature(body, { id: "msg_2", timestamp: ts, signature: good }, SECRET, now), false);
  assert.equal(verifyResendWebhookSignature(body, { id: "msg_1", timestamp: String(now - 1000), signature: sign(body, "msg_1", String(now - 1000)) }, SECRET, now), false);
  assert.equal(verifyResendWebhookSignature(body, { id: "msg_1", timestamp: ts, signature: "v1,AAAA" }, SECRET, now), false);
  assert.equal(verifyResendWebhookSignature(body, {}, SECRET, now), false);
});

test("resend payload maps onto the shared ParsedMail shape with header fallbacks", () => {
  const parsed = resendEmailToParsedMail(
    {
      message_id: "<m9@sender.example>",
      from: "seller@quarry.example",
      to: ["udc@updowncircle.site"],
      subject: "Copper cathodes",
      text: "  Offer attached. ",
      created_at: "2026-11-14T10:00:00.000Z",
      headers: { "References": "<m8@sender.example> <m7@sender.example>", "Reply-To": "boss@quarry.example" },
    },
    [{ contentId: "cid1", filename: "loi.pdf", contentType: "application/pdf", content: Buffer.from("pdf") }],
    { emailId: "e9" },
  );
  assert.equal(parsed.messageId, "<m9@sender.example>");
  assert.equal(parsed.from?.value[0]?.address, "seller@quarry.example");
  assert.equal(parsed.to?.value[0]?.address, "udc@updowncircle.site");
  assert.deepEqual(parsed.references, ["<m8@sender.example>", "<m7@sender.example>"]);
  assert.equal(parsed.replyTo?.value[0]?.address, "boss@quarry.example");
  assert.equal(parsed.attachments?.[0]?.filename, "loi.pdf");
  // html-only mail still yields body text for the workers
  const htmlOnly = resendEmailToParsedMail({ from: "a@b.example", html: "<p>Hello <b>there</b></p>" }, [], { emailId: "e10" });
  assert.match(htmlOnly.text ?? "", /Hello there/);
});

test("a received email flows through the shared pipeline exactly once", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const claims: Array<{ hash: string; state: string }> = [];
  const ports = {
    claimLookup: async (hash: string) => {
      const found = claims.filter((c) => c.hash === hash).pop();
      return found ? { state: found.state } : null;
    },
    claimInsert: async (hash: string) => { claims.push({ hash, state: "processing" }); },
    claimUpdate: async (hash: string, state: string) => { claims.push({ hash, state }); },
    resolveAccount: async () => null,
    storeEmailAttachments: async () => ({ stored: 0 }),
  };
  const parsed = resendEmailToParsedMail(
    {
      message_id: "<once@sender.example>",
      from: "buyer@mill.example",
      to: ["udc@updowncircle.site"],
      subject: "RFQ",
      text: "Need 5t aluminium.",
      created_at: "2026-11-14T10:05:00.000Z",
    },
    [],
    { emailId: "e11" },
  );
  const first = await processLiveEmailMessage("e11", parsed, ports, ENV);
  assert.equal(first.state, "processed");
  assert.equal(first.alreadyProcessed, false);
  const second = await processLiveEmailMessage("e11", parsed, ports, ENV);
  assert.equal(second.alreadyProcessed, true);
  assert.equal(claims.filter((c) => c.state === "processing").length, 1);
});

test("the router rejects bad signatures and ignores non-received events", async () => {
  const router = createEmailResendInboundRouter({
    env: ENV,
    fetchFn: async () => { throw new Error("fetch must not run in this test"); },
    ports: {
      claimLookup: async () => null,
      claimInsert: async () => {},
      claimUpdate: async () => {},
      resolveAccount: async () => null,
    },
  });
  const layer = (router as unknown as { stack: Array<{ route: { path: string; stack: Array<{ handle: (req: unknown, res: unknown) => Promise<void> }> } }> }).stack
    .find((l) => l.route?.path === "/email/resend-inbound");
  assert.ok(layer, "route registered");
  const handle = layer.route.stack[0].handle;
  const invoke = (body: unknown, headers: Record<string, string>, rawBody?: string) => new Promise<{ status: number; json: unknown }>((resolve) => {
    const req = {
      body,
      rawBody: rawBody === undefined ? undefined : Buffer.from(rawBody),
      header: (name: string) => headers[name.toLowerCase()],
      is: () => true,
    };
    const res = {
      statusCode: 200,
      payload: undefined as unknown,
      set() { return this; },
      status(code: number) { this.statusCode = code; return this; },
      json(p: unknown) { this.payload = p; resolve({ status: this.statusCode, json: p }); return this; },
    };
    void handle(req, res);
  });

  const body = { type: "email.received", data: { email_id: "e1" } };
  const raw = JSON.stringify(body);
  const now = Math.floor(Date.now() / 1000);
  const bad = await invoke(body, { "svix-id": "m1", "svix-timestamp": String(now), "svix-signature": "v1,bogus" }, raw);
  assert.equal(bad.status, 401);
  const ignored = await invoke({ type: "email.sent", data: {} }, (() => {
    const r = JSON.stringify({ type: "email.sent", data: {} });
    return { "svix-id": "m2", "svix-timestamp": String(now), "svix-signature": sign(r, "m2", String(now)), __raw: r };
  })());
  assert.equal(ignored.status, 200);
  assert.deepEqual(ignored.json, { ignored: true });
});

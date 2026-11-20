import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { logOutboundSend, runWithSendContext } from "../src/whatsapp/sendRegistry.ts";
import { sendWhatsAppText, sendWhatsAppReaction } from "../src/whatsapp/client.ts";

const SECRET_BODY = "SECRETBODY-xyzzy";
const SECRET_TOKEN = "tok-secret-abcdef";
const RECIPIENT_DIGITS = "15550009999";

let logged: string[];
let realInfo: typeof console.info;
let realFetch: typeof globalThis.fetch;
let savedEnv: Record<string, string | undefined>;

const ENV_KEYS = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "AKIF_WHATSAPP_REPLY_SINK", "UDC_WHATSAPP_ONLY_TO", "RENDER_GIT_COMMIT", "RENDER_SERVICE_NAME"];

beforeEach(() => {
  logged = [];
  realInfo = console.info;
  console.info = (...args: unknown[]) => { logged.push(args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")); };
  realFetch = globalThis.fetch;
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.WHATSAPP_ACCESS_TOKEN = SECRET_TOKEN;
  process.env.WHATSAPP_PHONE_NUMBER_ID = "pnid-1";
  delete process.env.AKIF_WHATSAPP_REPLY_SINK;
  delete process.env.UDC_WHATSAPP_ONLY_TO;
  delete process.env.RENDER_GIT_COMMIT;
  delete process.env.RENDER_SERVICE_NAME;
});

afterEach(() => {
  console.info = realInfo;
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
});

const sendLogs = () => logged.filter((l) => l.includes("UDC outbound send"));
const okFetch = (id: string) => (async () => Response.json({ messages: [{ id }] })) as any;

test("submitted send: caller logs from the already-parsed ack, return preserved, context from run scope", async () => {
  globalThis.fetch = okFetch("wamid.PROVIDER1");
  const result = await runWithSendContext({ inbound: "wamid.INBOUND9", origin: "brain" }, () => sendWhatsAppText(`+${RECIPIENT_DIGITS}`, SECRET_BODY));
  assert.deepEqual(result, { delivered: true, messageId: "wamid.PROVIDER1" }); // return preserved exactly
  const line = sendLogs().at(-1)!;
  assert.ok(line);
  assert.match(line, /"caller":"sendWhatsAppText"/);
  assert.match(line, /"type":"text"/);
  assert.match(line, /"origin":"brain"/);
  assert.match(line, /"inbound":"wamid.INBOUND9"/);
  assert.match(line, /"providerMessageId":"wamid.PROVIDER1"/);
  assert.match(line, /"outcome":"submitted"/);
  assert.doesNotMatch(line, new RegExp(SECRET_BODY));
  assert.doesNotMatch(line, new RegExp(RECIPIENT_DIGITS));
  assert.doesNotMatch(line, new RegExp(SECRET_TOKEN));
});

test("success path never clones or re-reads the response (clone throws, body readable once)", async () => {
  class NoCloneResponse extends Response {
    override clone(): Response { throw new Error("response.clone() must not be called on the critical path"); }
  }
  globalThis.fetch = (async () => new NoCloneResponse(JSON.stringify({ messages: [{ id: "wamid.NOCLONE" }] }), { status: 200, headers: { "content-type": "application/json" } })) as any;
  const result = await sendWhatsAppText(`+${RECIPIENT_DIGITS}`, SECRET_BODY);
  assert.deepEqual(result, { delivered: true, messageId: "wamid.NOCLONE" });
  assert.match(sendLogs().at(-1)!, /"outcome":"submitted"/);
  assert.equal(sendLogs().length, 1);
});

test("2xx with unreadable ack: outcome unknown, return shape preserved, no invented provider id", async () => {
  globalThis.fetch = (async () => new Response("not json at all", { status: 200 })) as any;
  const result = await sendWhatsAppText(`+${RECIPIENT_DIGITS}`, SECRET_BODY);
  assert.deepEqual(result, { delivered: false, reason: "provider_outcome_unknown" });
  const line = sendLogs().at(-1)!;
  assert.match(line, /"outcome":"unknown"/);
  assert.match(line, /"providerMessageId":null/);
});

test("provider rejection: WhatsAppSendError passthrough unchanged, provider_error with status only", async () => {
  globalThis.fetch = (async () => Response.json({ error: { code: 131030, message: SECRET_BODY } }, { status: 400 })) as any;
  await assert.rejects(
    () => sendWhatsAppText(`+${RECIPIENT_DIGITS}`, SECRET_BODY),
    (err: any) => {
      assert.equal(err.constructor.name, "WhatsAppSendError");
      assert.match(err.message, /^whatsapp_delivery_failed http=400 code=131030 subcode=none$/);
      return true;
    },
  );
  const line = sendLogs().at(-1)!;
  assert.match(line, /"outcome":"provider_error"/);
  assert.match(line, /"httpStatus":400/);
  assert.match(line, /"providerMessageId":null/);
  assert.doesNotMatch(line, new RegExp(SECRET_BODY)); // provider error payload never logged
  assert.doesNotMatch(line, new RegExp(RECIPIENT_DIGITS));
});

test("unknown transport outcome (5xx swallowed): return shape preserved, one unknown line", async () => {
  globalThis.fetch = (async () => new Response("upstream", { status: 500 })) as any;
  const result = await sendWhatsAppText(`+${RECIPIENT_DIGITS}`, SECRET_BODY);
  assert.deepEqual(result, { delivered: false, reason: "provider_outcome_unknown" });
  assert.match(sendLogs().at(-1)!, /"outcome":"unknown"/);
  assert.equal(sendLogs().length, 1); // once per call's final outcome, not per attempt
});

test("scope precheck: send blocked before transport is NOT logged (documented exclusion), no fetch", async () => {
  process.env.UDC_WHATSAPP_ONLY_TO = "999999999999";
  let fetched = 0;
  globalThis.fetch = (async () => { fetched++; return Response.json({ messages: [{ id: "wamid.X" }] }); }) as any;
  await sendWhatsAppReaction(`+${RECIPIENT_DIGITS}`, "wamid.IN", "👍");
  assert.equal(fetched, 0);
  assert.equal(sendLogs().length, 0);
});

test("reply sink: single outcome line, marked sunk with the sink id, no real fetch", async () => {
  process.env.AKIF_WHATSAPP_REPLY_SINK = "store";
  let fetched = 0;
  globalThis.fetch = (async () => { fetched++; return Response.json({ messages: [{ id: "wamid.REAL" }] }); }) as any;
  const result = await sendWhatsAppText(`+${RECIPIENT_DIGITS}`, SECRET_BODY) as any;
  assert.equal(fetched, 0);
  assert.equal(result.delivered, true);
  assert.equal(sendLogs().length, 1);
  const line = sendLogs()[0];
  assert.match(line, /"outcome":"sunk"/);
  assert.match(line, new RegExp(`"providerMessageId":"${result.messageId}"`));
  assert.doesNotMatch(line, new RegExp(SECRET_BODY));
});

test("logging never throws: a throwing console.info cannot break a send", async () => {
  globalThis.fetch = okFetch("wamid.THROWLOG");
  console.info = (() => { throw new Error("console broken"); }) as any;
  const result = await sendWhatsAppText(`+${RECIPIENT_DIGITS}`, SECRET_BODY);
  assert.deepEqual(result, { delivered: true, messageId: "wamid.THROWLOG" });
});

test("isolation: two concurrent run scopes never cross-contaminate", async () => {
  const gate = (() => { let r: () => void; const p = new Promise<void>((res) => { r = res; }); return { p, release: () => r() }; })();
  const chainA = runWithSendContext({ inbound: "wamid.A", origin: "brain" }, async () => {
    await gate.p; // yield so chain B runs in between
    logOutboundSend({ caller: "chainA", type: "text", outcome: "submitted", providerMessageId: "wamid.OUTA" });
  });
  const chainB = runWithSendContext({ inbound: "wamid.B", origin: "relay" }, async () => {
    logOutboundSend({ caller: "chainB", type: "text", outcome: "submitted", providerMessageId: "wamid.OUTB" });
  });
  gate.release();
  await Promise.all([chainA, chainB]);
  const a = sendLogs().find((l) => l.includes("wamid.OUTA"))!;
  const b = sendLogs().find((l) => l.includes("wamid.OUTB"))!;
  assert.match(a, /"inbound":"wamid.A"/);
  assert.match(a, /"origin":"brain"/);
  assert.match(b, /"inbound":"wamid.B"/);
  assert.match(b, /"origin":"relay"/);
});

test("isolation: nested run scope restores the outer context on settle", async () => {
  await runWithSendContext({ inbound: "wamid.OUTER", origin: "brain" }, async () => {
    await runWithSendContext({ inbound: "wamid.TURN", origin: "hermes_trial" }, async () => {
      logOutboundSend({ caller: "tool", type: "text", outcome: "submitted", providerMessageId: "wamid.INNER" });
    });
    logOutboundSend({ caller: "after", type: "text", outcome: "submitted", providerMessageId: "wamid.AFTER" });
  });
  const inner = sendLogs().find((l) => l.includes("wamid.INNER"))!;
  assert.match(inner, /"origin":"hermes_trial"/);
  assert.match(inner, /"inbound":"wamid.TURN"/);
  const after = sendLogs().find((l) => l.includes("wamid.AFTER"))!;
  assert.match(after, /"origin":"brain"/);
  assert.match(after, /"inbound":"wamid.OUTER"/);
});

test("isolation: continuation AFTER a run settles logs nulls - no ambient stamp survives", async () => {
  await runWithSendContext({ inbound: "wamid.DONE", origin: "brain" }, async () => {
    logOutboundSend({ caller: "inside", type: "text", outcome: "submitted", providerMessageId: "wamid.INS" });
  });
  // A later unstamped continuation (background follow-up, next gate in the
  // webhook loop, a skipped message's code) must NOT inherit the run's ids.
  logOutboundSend({ caller: "continuation", type: "text", outcome: "submitted", providerMessageId: "wamid.CONT" });
  const cont = sendLogs().find((l) => l.includes("wamid.CONT"))!;
  assert.match(cont, /"inbound":null/);
  assert.match(cont, /"origin":null/);
});

test("isolation: async resource created inside a run keeps its context; parallel unstamped worker logs nulls", async () => {
  let timerFired = false;
  await Promise.all([
    runWithSendContext({ inbound: "wamid.REQ", origin: "brain" }, async () => {
      await new Promise<void>((resolve) => setTimeout(() => {
        logOutboundSend({ caller: "timer", type: "text", outcome: "submitted", providerMessageId: "wamid.OUTT" });
        timerFired = true;
        resolve();
      }, 5));
    }),
    (async () => {
      await new Promise((r) => setTimeout(r, 2));
      logOutboundSend({ caller: "worker", type: "text", outcome: "unknown" });
    })(),
  ]);
  assert.ok(timerFired);
  assert.match(sendLogs().find((l) => l.includes("wamid.OUTT"))!, /"inbound":"wamid.REQ"/);
  const worker = sendLogs().find((l) => l.includes('"caller":"worker"'))!;
  assert.match(worker, /"inbound":null/);
  assert.match(worker, /"origin":null/);
});

test("logging never throws on odd input and never invents context", async () => {
  logOutboundSend({ caller: "unit", outcome: "unknown" } as any);
  const line = sendLogs().at(-1)!;
  assert.match(line, /"caller":"unit"/);
  assert.match(line, /"inbound":null/);
  assert.match(line, /"origin":null/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  HUMAN_RELAY_MAX_REPLY_CHARS,
  admitHumanRelayReply,
  enqueueHumanRelay,
  humanRelayActiveFor,
  humanRelayBacklogSize,
  humanRelayEnabled,
  humanRelayNumbers,
  lastHeardLanguageFor,
  markHumanRelayAnswered,
  pendingHumanRelay,
  pruneHumanRelay,
  relayBodyAuthorized,
  relayReadAuthorized,
  resetHumanRelay,
  validateRelayReplyText,
} from "../src/akif/humanRelay.ts";

const SECRET = "test-app-secret";
const envOn = { AKIF_HUMAN_RELAY_ENABLED: "true", AKIF_HUMAN_RELAY_NUMBERS: "+91 70220 32531", WHATSAPP_APP_SECRET: SECRET } as NodeJS.ProcessEnv;

test("relay is off by default and ignores malformed flags", () => {
  assert.equal(humanRelayEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(humanRelayEnabled({ AKIF_HUMAN_RELAY_ENABLED: "1" } as NodeJS.ProcessEnv), false);
  assert.equal(humanRelayEnabled(envOn), true);
});

test("allowlist parses digits only and drops short entries", () => {
  assert.deepEqual(humanRelayNumbers(envOn), ["917022032531"]);
  assert.deepEqual(humanRelayNumbers({ AKIF_HUMAN_RELAY_NUMBERS: "123, abc, 917022032531," } as NodeJS.ProcessEnv), ["917022032531"]);
});

test("active-for needs the relay on and the number allowlisted, digit-normalized", () => {
  assert.equal(humanRelayActiveFor("+91 70220-32531", envOn), true);
  assert.equal(humanRelayActiveFor("919999999999", envOn), false);
  assert.equal(humanRelayActiveFor("917022032531", { ...envOn, AKIF_HUMAN_RELAY_ENABLED: "false" } as NodeJS.ProcessEnv), false);
});

test("enqueue holds items, pending excludes answered, mark-answered counts", () => {
  resetHumanRelay();
  enqueueHumanRelay({ phone: "+91 70220 32531", kind: "text", text: "hello", draft: "draft reply" });
  enqueueHumanRelay({ phone: "917022032531", kind: "voice", text: "spoken", heardLanguage: "ml" });
  const pending = pendingHumanRelay();
  assert.equal(pending.length, 2);
  assert.equal(pending[0].draft, "draft reply");
  assert.equal(pending[0].answeredAt, null);
  assert.equal(markHumanRelayAnswered("917022032531"), 2);
  assert.equal(pendingHumanRelay().length, 0);
  assert.equal(markHumanRelayAnswered("917022032531"), 0);
});

test("per-phone cap drops the oldest item for that phone", () => {
  resetHumanRelay();
  for (let i = 0; i < 25; i++) enqueueHumanRelay({ phone: "917022032531", kind: "text", text: `m${i}` });
  const pending = pendingHumanRelay();
  assert.equal(pending.length, 20);
  assert.equal(pending[0].text, "m5"); // m0-m4 dropped oldest-first
});

test("ttl prune drops old items", () => {
  resetHumanRelay();
  enqueueHumanRelay({ phone: "917022032531", kind: "text", text: "old" });
  pruneHumanRelay(Date.now() + 7 * 60 * 60 * 1000); // 7h later, past the 6h TTL
  assert.equal(humanRelayBacklogSize(), 0);
});

test("last heard language looks back per phone", () => {
  resetHumanRelay();
  enqueueHumanRelay({ phone: "917022032531", kind: "voice", text: "a", heardLanguage: "ml" });
  enqueueHumanRelay({ phone: "917022032531", kind: "text", text: "b" });
  assert.equal(lastHeardLanguageFor("917022032531"), "ml");
  assert.equal(lastHeardLanguageFor("910000000000"), undefined);
});

test("read authorization needs the app-secret HMAC over read-relay", () => {
  const good = "sha256=" + createHmac("sha256", SECRET).update("read-relay").digest("hex");
  assert.equal(relayReadAuthorized(good, envOn), true);
  assert.equal(relayReadAuthorized("sha256=" + "0".repeat(64), envOn), false);
  assert.equal(relayReadAuthorized(undefined, envOn), false);
  assert.equal(relayReadAuthorized(good, {} as NodeJS.ProcessEnv), false);
});

test("body authorization signs the exact raw body", () => {
  const raw = Buffer.from(JSON.stringify({ phone: "917022032531", text: "hi" }));
  const good = "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
  assert.equal(relayBodyAuthorized(good, raw, envOn), true);
  assert.equal(relayBodyAuthorized(good, Buffer.from("{}"), envOn), false);
  assert.equal(relayBodyAuthorized(good, undefined, envOn), false);
});

test("reply text validation trims and bounds length", () => {
  assert.equal(validateRelayReplyText("  hello  "), "hello");
  assert.equal(validateRelayReplyText("   "), null);
  assert.equal(validateRelayReplyText(42), null);
  assert.equal(validateRelayReplyText("x".repeat(HUMAN_RELAY_MAX_REPLY_CHARS + 1)), null);
  assert.equal(validateRelayReplyText("x".repeat(HUMAN_RELAY_MAX_REPLY_CHARS))?.length, HUMAN_RELAY_MAX_REPLY_CHARS);
});

test("reply admission is bounded per window", () => {
  resetHumanRelay();
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) assert.equal(admitHumanRelayReply(t0 + i), true);
  assert.equal(admitHumanRelayReply(t0 + 10), false);
  assert.equal(admitHumanRelayReply(t0 + 61_000), true);
});

test("relay alert email fires when configured and stays silent otherwise", async () => {
  const prev = { alert: process.env.AKIF_RELAY_ALERT_EMAIL, key: process.env.RESEND_API_KEY, from: process.env.UDC_AUTH_EMAIL_FROM };
  const prevFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];
  try {
    globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    resetHumanRelay();
    delete process.env.AKIF_RELAY_ALERT_EMAIL;
    enqueueHumanRelay({ phone: "917022032531", kind: "text", text: "no alert" });
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, 0);

    process.env.AKIF_RELAY_ALERT_EMAIL = "owner@example.com";
    process.env.RESEND_API_KEY = "re_test_123456789";
    process.env.UDC_AUTH_EMAIL_FROM = "UDC <alerts@updowncircle.site>";
    enqueueHumanRelay({ phone: "+91 70220 32531", kind: "voice", text: "spoken hello" });
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, 1);
    const payload = JSON.parse(calls[0].body);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.deepEqual(payload.to, ["owner@example.com"]);
    assert.equal(payload.from, "UDC <alerts@updowncircle.site>");
    assert.match(payload.subject, /voice message from \+917022032531/);
    assert.match(payload.text, /spoken hello/);
    assert.doesNotMatch(payload.text, /Brain draft/);

    enqueueHumanRelay({ phone: "917022032531", kind: "text", text: "need prices", draft: "Draft reply the dev side may edit." });
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, 2);
    const withDraft = JSON.parse(calls[1].body);
    assert.match(withDraft.text, /Brain draft \(not sent; the dev side may edit before replying\):/);
    assert.match(withDraft.text, /Draft reply the dev side may edit\./);
  } finally {
    globalThis.fetch = prevFetch;
    if (prev.alert === undefined) delete process.env.AKIF_RELAY_ALERT_EMAIL; else process.env.AKIF_RELAY_ALERT_EMAIL = prev.alert;
    if (prev.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = prev.key;
    if (prev.from === undefined) delete process.env.UDC_AUTH_EMAIL_FROM; else process.env.UDC_AUTH_EMAIL_FROM = prev.from;
    resetHumanRelay();
  }
});

test("relay alert email failure does not break enqueue", async () => {
  const prev = { alert: process.env.AKIF_RELAY_ALERT_EMAIL, key: process.env.RESEND_API_KEY, from: process.env.UDC_AUTH_EMAIL_FROM };
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response("bad", { status: 500 })) as typeof fetch;
    process.env.AKIF_RELAY_ALERT_EMAIL = "owner@example.com";
    process.env.RESEND_API_KEY = "re_test_123456789";
    process.env.UDC_AUTH_EMAIL_FROM = "UDC <alerts@updowncircle.site>";
    resetHumanRelay();
    const item = enqueueHumanRelay({ phone: "917022032531", kind: "text", text: "still held" });
    await new Promise((r) => setImmediate(r));
    assert.equal(item.answeredAt, null);
    assert.equal(pendingHumanRelay().length, 1);
  } finally {
    globalThis.fetch = prevFetch;
    if (prev.alert === undefined) delete process.env.AKIF_RELAY_ALERT_EMAIL; else process.env.AKIF_RELAY_ALERT_EMAIL = prev.alert;
    if (prev.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = prev.key;
    if (prev.from === undefined) delete process.env.UDC_AUTH_EMAIL_FROM; else process.env.UDC_AUTH_EMAIL_FROM = prev.from;
    resetHumanRelay();
  }
});

test("simple greeting detection is strict and fails closed", async () => {
  const { isSimpleGreetingText, greetingAutoReplySafe } = await import("../src/akif/humanRelay.ts");
  for (const yes of ["Hi", "hello!", "hey", "Good morning", "Hello, how are you?", "how r u", "namaste", "What's up?"]) {
    assert.equal(isSimpleGreetingText(yes), true, `should greet: ${yes}`);
  }
  for (const no of ["", "Hi, I need 500 kg cashew", "hello price?", "Damn", "Also my father just died", "hi there what is the rate", "hello " + "x".repeat(80)]) {
    assert.equal(isSimpleGreetingText(no), false, `should hold: ${no.slice(0, 30)}`);
  }
  assert.equal(greetingAutoReplySafe(null), false);
  assert.equal(greetingAutoReplySafe("Doing well, thanks! How can I help?"), true);
  assert.equal(greetingAutoReplySafe("See https://example.com"), false);
  assert.equal(greetingAutoReplySafe("Call 9876543210 now"), false);
  assert.equal(greetingAutoReplySafe("Here is the menu"), false);
  assert.equal(greetingAutoReplySafe("x".repeat(301)), false);
});

test("auto-answered relay item is not pending and the alert email says so", async () => {
  const prev = { alert: process.env.AKIF_RELAY_ALERT_EMAIL, key: process.env.RESEND_API_KEY, from: process.env.UDC_AUTH_EMAIL_FROM };
  const prevFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];
  try {
    globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    process.env.AKIF_RELAY_ALERT_EMAIL = "owner@example.com";
    process.env.RESEND_API_KEY = "re_test_123456789";
    process.env.UDC_AUTH_EMAIL_FROM = "UDC <alerts@updowncircle.site>";

    resetHumanRelay();
    const { pendingHumanRelay } = await import("../src/akif/humanRelay.ts");
    enqueueHumanRelay({ phone: "917022032531", kind: "text", text: "Hello", draft: "Hi! How can I help?", autoAnswered: true });
    await new Promise((r) => setImmediate(r));
    assert.equal(pendingHumanRelay().length, 0);
    assert.equal(calls.length, 1);
    const payload = JSON.parse(calls[0].body);
    assert.match(payload.text, /Auto-answered as a simple greeting/);
    assert.match(payload.text, /Hi! How can I help\?/);
    assert.doesNotMatch(payload.text, /not sent; the dev side may edit/);
  } finally {
    globalThis.fetch = prevFetch;
    if (prev.alert === undefined) delete process.env.AKIF_RELAY_ALERT_EMAIL; else process.env.AKIF_RELAY_ALERT_EMAIL = prev.alert;
    if (prev.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = prev.key;
    if (prev.from === undefined) delete process.env.UDC_AUTH_EMAIL_FROM; else process.env.UDC_AUTH_EMAIL_FROM = prev.from;
    resetHumanRelay();
  }
});

test("acknowledgement detection and emoji choice are strict", async () => {
  const { isAcknowledgementText, ackEmojiFor } = await import("../src/akif/humanRelay.ts");
  for (const yes of ["Ok", "okay!", "thanks", "Thank you so much", "noted", "got it", "👍", "k"]) {
    assert.equal(isAcknowledgementText(yes), true, `should ack: ${yes}`);
  }
  for (const no of ["", "ok send the link", "thanks but what about price", "okay 500 kg W320", "Damn", "hello"]) {
    assert.equal(isAcknowledgementText(no), false, `should not ack: ${no.slice(0, 30)}`);
  }
  assert.equal(ackEmojiFor("thanks a lot"), "🙏");
  assert.equal(ackEmojiFor("ok"), "👍");
});

test("tool-backed auto reply needs a real tool run; links need tools", async () => {
  const { relayAutoToolReplySafe } = await import("../src/akif/humanRelay.ts");
  assert.equal(relayAutoToolReplySafe(null, ["show_feature"]), false);
  assert.equal(relayAutoToolReplySafe("Here is your link: https://updowncircle.site/upload/abc", []), false);
  assert.equal(relayAutoToolReplySafe("Here is your link: https://updowncircle.site/upload/abc", ["show_feature"]), true);
  assert.equal(relayAutoToolReplySafe("Short answer.", ["trade_reference"]), true);
  assert.equal(relayAutoToolReplySafe("x".repeat(601), ["show_feature"]), false);
  assert.equal(relayAutoToolReplySafe("Here is the menu", ["show_feature"]), false);
});

test("relay audio decoder accepts only real Ogg containers within 16 MB", async () => {
  const { decodeRelayAudio } = await import("../src/akif/humanRelay.ts");
  const ogg = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(100, 1)]);
  assert.ok(decodeRelayAudio(ogg.toString("base64")));
  assert.equal(decodeRelayAudio(Buffer.from("not-ogg-at-all-not-ogg").toString("base64")), null);
  assert.equal(decodeRelayAudio(Buffer.alloc(10).toString("base64")), null);
  assert.equal(decodeRelayAudio("%%%not-base64%%%"), null);
});

test("relay menu requests auto-send the brain's explanation, menu word allowed, links still blocked", async () => {
  const { isMenuRequestText, menuAutoReplySafe } = await import("../src/akif/humanRelay.ts");
  assert.equal(isMenuRequestText("Menu"), true);
  assert.equal(isMenuRequestText("menu"), true);
  assert.equal(isMenuRequestText("Show me the menu"), true);
  assert.equal(isMenuRequestText("send udc menu!"), true);
  assert.equal(isMenuRequestText("menu please"), false);
  assert.equal(isMenuRequestText("what can you do"), false);
  assert.equal(menuAutoReplySafe("You can check your documents, deals and profile from the menu - what do you need?"), true);
  assert.equal(menuAutoReplySafe("Here is your link: https://updowncircle.site/upload/X1"), false);
  assert.equal(menuAutoReplySafe(""), false);
  assert.equal(menuAutoReplySafe(null), false);
});

test("relay reply sanitizer removes dash sentence breaks but keeps ranges and hyphenated words", async () => {
  const { sanitizeRelayReplyText } = await import("../src/akif/humanRelay.ts");
  assert.equal(sanitizeRelayReplyText("Nice choice! Best country depends on the nut - Vietnam and Ivory Coast are strong for cashew"), "Nice choice! Best country depends on the nut, Vietnam and Ivory Coast are strong for cashew");
  assert.equal(sanitizeRelayReplyText("works 15 minutes - one tap uploads them all"), "works 15 minutes, one tap uploads them all");
  assert.equal(sanitizeRelayReplyText("10 - 15 kg is fine"), "10 - 15 kg is fine");
  assert.equal(sanitizeRelayReplyText("single-use link"), "single-use link");
});

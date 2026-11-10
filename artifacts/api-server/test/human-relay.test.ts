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

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guidance = readFileSync(new URL("../src/whatsapp/guidance.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");

test("guidance memory window is 30 messages, 1000 chars, 72h", () => {
  assert.match(guidance, /HISTORY_MESSAGES = 30/);
  assert.match(guidance, /HISTORY_CHARS = 1000/);
  assert.match(guidance, /HISTORY_TTL_MS = 72 \* 60 \* 60_000/);
});

test("prompt carries the approved scope and estimate rules and quoted-reply hint", () => {
  assert.match(guidance, /Do not say it is outside scope/);
  assert.match(guidance, /rough examples that change/);
  assert.match(guidance, /quotedReply is true/);
  assert.match(webhook, /Boolean\(message\.context\?\.id\)/);
});

test("no-deal file reply wording is the approved text", () => {
  assert.match(webhook, /you have no active deal yet\. Send Menu, tap More options, then Documents, and I will send you a private, single-use upload link for your company registration or trade-license PDF\./);
  assert.match(webhook, /Agents do not upload documents here, so I have not kept it\./);
});

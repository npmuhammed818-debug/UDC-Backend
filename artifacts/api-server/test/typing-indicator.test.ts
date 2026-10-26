import test from "node:test";
import assert from "node:assert/strict";
import { markReadAndTyping } from "../src/whatsapp/client.ts";

const env = (over: Record<string, string | undefined>) => {
  const keys = ["UDC_WHATSAPP_TYPING", "AKIF_WHATSAPP_REPLY_SINK", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  for (const [k, v] of Object.entries(over)) if (v !== undefined) process.env[k] = v;
  return () => { for (const k of keys) before[k] === undefined ? delete process.env[k] : (process.env[k] = before[k]); };
};
async function withFetch(fn: (calls: Array<{ url: string; body: any }>) => Promise<void> | void, impl?: () => Promise<Response>) {
  const real = globalThis.fetch; const calls: Array<{ url: string; body: any }> = [];
  globalThis.fetch = (async (url: any, init: any) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return impl ? impl() : new Response("{}"); }) as typeof fetch;
  try { await fn(calls); await new Promise(r => setTimeout(r, 20)); } finally { globalThis.fetch = real; }
}

test("off by default: no call to Meta", async () => {
  const restore = env({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "p" });
  try { await withFetch(calls => { markReadAndTyping("15555550101", "wamid.ABC123"); assert.equal(calls.length, 0); }); } finally { restore(); }
});
test("on: one read + typing call with the inbound message id", async () => {
  const restore = env({ UDC_WHATSAPP_TYPING: "on", WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "p" });
  try { await withFetch(calls => { markReadAndTyping("15555550101", "wamid.ABC123");
    assert.equal(calls.length, 1); assert.match(calls[0].url, /\/p\/messages$/);
    assert.deepEqual(calls[0].body, { messaging_product: "whatsapp", status: "read", message_id: "wamid.ABC123", typing_indicator: { type: "text" } }); }); } finally { restore(); }
});
test("on but missing id or config: nothing sent", async () => {
  let restore = env({ UDC_WHATSAPP_TYPING: "on", WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "p" });
  try { await withFetch(calls => { markReadAndTyping("1", undefined); markReadAndTyping("1", ""); assert.equal(calls.length, 0); }); } finally { restore(); }
  restore = env({ UDC_WHATSAPP_TYPING: "on" });
  try { await withFetch(calls => { markReadAndTyping("1", "wamid.ABC123"); assert.equal(calls.length, 0); }); } finally { restore(); }
});
test("sink on: nothing sent to Meta", async () => {
  const restore = env({ UDC_WHATSAPP_TYPING: "on", AKIF_WHATSAPP_REPLY_SINK: "store", WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "p" });
  try { await withFetch(calls => { markReadAndTyping("15555550101", "wamid.ABC123"); assert.equal(calls.length, 0); }); } finally { restore(); }
});
test("a failing or rejected call never throws", async () => {
  const restore = env({ UDC_WHATSAPP_TYPING: "on", WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "p" });
  try {
    await withFetch(() => { assert.doesNotThrow(() => markReadAndTyping("1", "wamid.ABC123")); }, () => Promise.reject(new Error("network down")));
    await withFetch(() => { assert.doesNotThrow(() => markReadAndTyping("1", "wamid.ABC123")); }, async () => new Response("{}", { status: 500 }));
  } finally { restore(); }
});

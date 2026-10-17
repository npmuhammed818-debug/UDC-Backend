import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { convertCurrency, searchTradeNews, getCountryIndicator, enrichMarketResearch } from "../src/akif/intelligence/freeDataSources.ts";
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let clock = originalNow();
beforeEach(() => { clock += 61_000; Date.now = () => clock; });
afterEach(() => { globalThis.fetch = originalFetch; Date.now = originalNow; });

test("FX preserves rate date and caches retrieval, without inventing a settlement rate", async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(String(url), "https://api.frankfurter.dev/v2/rate/USD/INR");
    return Response.json({ date: "2026-10-15", rate: 84 });
  };
  const result = await convertCurrency({ base: "usd", quote: "inr", amount: 100 });
  assert.equal(result.data.convertedAmount, 8400);
  assert.equal(result.data.rateDate, "2026-10-15");
  const cached = await convertCurrency({ base: "USD", quote: "INR", amount: 2 });
  assert.equal(cached.data.convertedAmount, 168);
  assert.equal(cached.retrievedAt, result.retrievedAt);
  assert.equal(calls, 1);
});
test("rejects malformed input before sending a network request", async () => {
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  await assert.rejects(convertCurrency({ base: "../evil", quote: "INR" }));
  await assert.rejects(convertCurrency({ base: "USD", quote: "INR", amount: NaN }));
  await assert.rejects(getCountryIndicator({ country: "../", indicator: "NY.GDP.MKTP.CD" }));
});
test("news retains article evidence and World Bank retains null/missing data", async () => {
  globalThis.fetch = async (url) => String(url).includes("gdelt")
    ? Response.json({ articles: [{ title: "Port report", url: "https://example.com/report", seendate: "20261015" }] })
    : Response.json([{ page: 1 }, [{ date: "2025", value: null, indicator: { id: "NY.GDP.MKTP.CD", value: "GDP" } }]]);
  const news = await searchTradeNews({ query: "copper port", limit: 1 });
  assert.equal(news.data[0].url, "https://example.com/report");
  const indicator = await getCountryIndicator({ country: "ARE", indicator: "NY.GDP.MKTP.CD" });
  assert.equal(indicator.data[0].value, null);
});
test("provider failures remain unavailable, never fabricated results", async () => {
  globalThis.fetch = async () => new Response("limited", { status: 429 });
  const result = await enrichMarketResearch("sugar", "Oman", "OMN");
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.unavailable, ["gdelt", "world_bank"]);
});
test("malformed upstream responses fail instead of calculating invalid prices", async () => {
  globalThis.fetch = async () => Response.json({ date: "2026-10-15", rate: -1 });
  await assert.rejects(convertCurrency({ base: "GBP", quote: "AED" }));
});
test("a GDELT error object is not reported as a successful empty news search", async () => {
  globalThis.fetch = async () => Response.json({ error: "invalid_query" });
  await assert.rejects(searchTradeNews({ query: "unique malformed response test" }));
});


test("temporary invalid JSON evidence cannot poison the provider cache", async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1
    ? Response.json({ error: "temporary upstream error" })
    : Response.json({ date: "2026-10-17", rate: 2 });
  await assert.rejects(convertCurrency({ base: "JPY", quote: "EUR" }), /source_invalid_response/);
  assert.equal((await convertCurrency({ base: "JPY", quote: "EUR" })).data.rate, 2);
  assert.equal(calls, 2);
});

test("source response limits stop streaming before buffering the entire body", async () => {
  let cancelled = false;
  let chunks = 0;
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(1_100_000)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(convertCurrency({ base: "CAD", quote: "INR" }), /source_response_too_large/);
  assert.equal(cancelled, true);
  assert.ok(chunks <= 3);
});

test("GDELT cooldown honors rate-limit headers without retries or delaying research", async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1
    ? new Response("limited", { status: 429, headers: { "retry-after": "12" } })
    : Response.json({ articles: [] });
  await assert.rejects(searchTradeNews({ query: "cooldown first" }), /source_http_429/);
  await assert.rejects(searchTradeNews({ query: "cooldown second" }), /gdelt_cooldown_active/);
  clock += 11_000;
  await assert.rejects(searchTradeNews({ query: "cooldown second" }), /gdelt_cooldown_active/);
  assert.equal(calls, 1);
  clock += 1_000;
  assert.deepEqual((await searchTradeNews({ query: "cooldown second" })).data, []);
  // Cached evidence remains usable during the request cooldown.
  assert.deepEqual((await searchTradeNews({ query: "cooldown second" })).data, []);
  assert.equal(calls, 2);
});

test("GDELT malformed responses recover after spacing without a poisoned cache", async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1
    ? Response.json({ error: "temporary" }) : Response.json({ articles: [] });
  await assert.rejects(searchTradeNews({ query: "recover cached error" }), /source_invalid_response/);
  clock += 5_000;
  assert.deepEqual((await searchTradeNews({ query: "recover cached error" })).data, []);
  assert.equal(calls, 2);
});


test("large valid provider results cannot grow the cache beyond its byte budget", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ articles: [
    { title: "a".repeat(1_800_000), url: "https://example.com/news" },
  ] }); };
  for (let i = 0; i < 5; i++) {
    await searchTradeNews({ query: `cache budget article ${i}` });
    clock += 5_000;
  }
  assert.equal(calls, 5);
  // Five large entries exceed 8 MB, so the first must be fetched again.
  await searchTradeNews({ query: "cache budget article 0" });
  assert.equal(calls, 6);
});

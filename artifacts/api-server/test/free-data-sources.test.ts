import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { convertCurrency, searchTradeNews, getCountryIndicator, enrichMarketResearch } from "../src/akif/intelligence/freeDataSources.ts";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

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

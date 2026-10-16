import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import {
  getEurostatTrade,
  screenCsl,
  getCslStatus,
  CslNotConfiguredError,
} from "../src/akif/intelligence/freeDataSources.ts";

const originalFetch = globalThis.fetch;
const originalKey = process.env.TRADE_GOV_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.TRADE_GOV_API_KEY;
  else process.env.TRADE_GOV_API_KEY = originalKey;
});

function eurostatResponse(
  value: Record<string, number | null> = { "0": 123.4 },
) {
  return {
    class: "dataset",
    label: "Trade",
    id: ["geo", "time"],
    size: [1, 1],
    dimension: {
      geo: { category: { index: { DE: 0 } } },
      time: { category: { index: { "2024": 0 } } },
    },
    value,
    status: { "0": "p" },
    updated: "2026-10-01",
  };
}

test("Eurostat uses the verified dataset/dimensions and preserves units, dates and flags", async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://ec.europa.eu");
    assert.ok(parsed.pathname.endsWith("/ext_lt_intertrd"));
    assert.equal(parsed.searchParams.get("indic_et"), "MIO_IMP_VAL");
    assert.equal(parsed.searchParams.get("sitc06"), "SITC0_1");
    assert.equal(parsed.searchParams.get("time"), "2024");
    assert.equal(init?.redirect, "error");
    return Response.json(eurostatResponse({ "0": null }));
  };
  const result = await getEurostatTrade({
    geo: "DE",
    year: 2024,
    productGroup: "SITC0_1",
  });
  assert.equal(result.unit, "million_ECU_EUR");
  assert.deepEqual(result.data.value, { "0": null });
  assert.deepEqual(result.data.status, { "0": "p" });
  const cached = await getEurostatTrade({
    geo: "DE",
    year: 2024,
    productGroup: "SITC0_1",
  });
  assert.equal(cached.retrievedAt, result.retrievedAt);
  assert.equal(calls, 1);
});

test("Eurostat rejects unsupported inputs without network access", async () => {
  globalThis.fetch = async () => {
    throw new Error("unexpected request");
  };
  await assert.rejects(getEurostatTrade({ geo: "../evil", year: 2024 }));
  await assert.rejects(getEurostatTrade({ geo: "DE", year: 1800 }));
  await assert.rejects(
    getEurostatTrade({ geo: "DE", year: 2024, productGroup: "7403" as never }),
  );
});

test("Eurostat failures and invalid schemas never become empty market evidence", async () => {
  globalThis.fetch = async () => Response.json({ error: "unknown dataset" });
  await assert.rejects(getEurostatTrade({ geo: "FR", year: 2023 }));
  globalThis.fetch = async () => new Response("limited", { status: 429 });
  await assert.rejects(
    getEurostatTrade({ geo: "ES", year: 2023 }),
    /source_http_429/,
  );
});

test("CSL reports a missing key without making a network call", async () => {
  delete process.env.TRADE_GOV_API_KEY;
  globalThis.fetch = async () => {
    throw new Error("unexpected request");
  };
  assert.equal(getCslStatus().configured, false);
  await assert.rejects(
    screenCsl({ name: "Example Trading" }),
    CslNotConfiguredError,
  );
});

test("CSL sends key in header, retains candidates, flags truncation and requires review", async () => {
  process.env.TRADE_GOV_API_KEY = "private-test-key";
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://data.trade.gov");
    assert.equal(parsed.pathname, "/consolidated_screening_list/v1/search");
    assert.equal(parsed.searchParams.get("name"), "Example Trading");
    assert.equal(parsed.searchParams.get("fuzzy_name"), "true");
    assert.ok(!String(url).includes("private-test-key"));
    assert.equal(
      (init?.headers as Record<string, string>)["subscription-key"],
      "private-test-key",
    );
    return Response.json({
      total: 2,
      results: [{ name: "Example Trading", source: "Entity List", score: 90 }],
    });
  };
  const result = await screenCsl({ name: "Example Trading", limit: 1 });
  assert.equal(result.truncated, true);
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.approvedToTrade, false);
  assert.equal(result.candidates[0].score, 90);
  assert.ok(!JSON.stringify(result).includes("private-test-key"));
  assert.ok(!JSON.stringify(getCslStatus()).includes("private-test-key"));
});

test("CSL no-match still requires review and screening requests are never cached", async () => {
  process.env.TRADE_GOV_API_KEY = "dummy";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ total: 0, results: [] });
  };
  for (let i = 0; i < 2; i++) {
    const result = await screenCsl({ name: "Unlisted Trading" });
    assert.equal(result.humanReviewRequired, true);
    assert.equal(result.approvedToTrade, false);
  }
  assert.equal(calls, 2);
});

test("CSL invalid and failed responses cannot turn into clearance", async () => {
  process.env.TRADE_GOV_API_KEY = "dummy";
  for (const status of [401, 403, 429, 500]) {
    globalThis.fetch = async () =>
      new Response("provider-private-detail", { status });
    await assert.rejects(
      screenCsl({ name: "Example" }),
      new RegExp(`csl_http_${status}`),
    );
  }
  globalThis.fetch = async () => Response.json({ results: [] });
  await assert.rejects(screenCsl({ name: "Example" }));
  globalThis.fetch = async () => {
    throw new Error("must not fetch");
  };
  await assert.rejects(screenCsl({ name: "x" }));
});

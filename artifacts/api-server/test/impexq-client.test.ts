import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  callImpexqHsnSandbox,
  callImpexqRodtepSandbox,
  callImpexqFtaSandbox,
  callImpexqCalculatorSandbox,
  getImpexqStatus,
} from "../src/akif/intelligence/impexqClient.ts";

const originalFetch = globalThis.fetch;
const originalKey = process.env.IMPEXQ_API_KEY;
const originalBase = process.env.IMPEXQ_SANDBOX_BASE_URL;
beforeEach(() => {
  process.env.IMPEXQ_API_KEY = "sb_test_unit_test_only";
  delete process.env.IMPEXQ_SANDBOX_BASE_URL;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.IMPEXQ_API_KEY;
  else process.env.IMPEXQ_API_KEY = originalKey;
  if (originalBase === undefined) delete process.env.IMPEXQ_SANDBOX_BASE_URL;
  else process.env.IMPEXQ_SANDBOX_BASE_URL = originalBase;
});

for (const [tool, call, payload] of [
  ["hsn", callImpexqHsnSandbox, { query: "basmati rice" }],
  ["rodtep", callImpexqRodtepSandbox, { query: "cotton t-shirts" }],
  ["fta", callImpexqFtaSandbox, { destination: "uae", query: "basmati rice" }],
  [
    "calculator",
    callImpexqCalculatorSandbox,
    { query: "basmati rice", cifValue: 5000, destination: "uae" },
  ],
] as const) {
  test(`${tool} sends the documented request and preserves sandbox provenance`, async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, `https://impexq.com/api/sandbox/${tool}`);
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.deepEqual(JSON.parse(String(init?.body)), payload);
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer sb_test_unit_test_only",
      );
      return Response.json({
        _sandbox: true,
        _mock: tool !== "fta",
        _callsRemaining: 499,
      });
    };
    const result = await call(payload);
    assert.equal(result.mode, "sandbox");
    assert.equal(result.mock, tool !== "fta");
    assert.equal(result.productionReady, false);
    assert.equal(result.data._callsRemaining, 499);
    assert.ok(Number.isFinite(Date.parse(result.retrievedAt)));
    assert.ok(!JSON.stringify(result).includes("sb_test_unit_test_only"));
    if (tool === "calculator") {
      assert.equal(result.currency, "INR");
      assert.equal(result.valueBasis, "per_unit_cif");
    }
  });
}

test("invalid input cannot consume sandbox quota or silently default CIF", async () => {
  globalThis.fetch = async () => {
    throw new Error("unexpected provider request");
  };
  for (const cifValue of [undefined, 0, -1, Infinity, NaN, "5000"]) {
    await assert.rejects(
      callImpexqCalculatorSandbox({ query: "rice", cifValue }),
      /cifValue/,
    );
  }
  await assert.rejects(callImpexqHsnSandbox({ query: "x" }), /query/);
  await assert.rejects(
    callImpexqRodtepSandbox({ query: "rice", secret: "private" }),
    /secret/,
  );
  await assert.rejects(
    callImpexqFtaSandbox({ destination: "dubai" }),
    /destination/,
  );
});

test("missing key fails before making a request and status exposes no secret", async () => {
  delete process.env.IMPEXQ_API_KEY;
  globalThis.fetch = async () => {
    throw new Error("unexpected provider request");
  };
  assert.deepEqual(getImpexqStatus().requiredEnvironmentVariables, [
    "IMPEXQ_API_KEY",
  ]);
  await assert.rejects(
    callImpexqHsnSandbox({ query: "rice" }),
    /not configured/,
  );
});

test("provider errors do not expose provider payloads", async () => {
  for (const status of [401, 403, 429, 500]) {
    globalThis.fetch = async () =>
      Response.json({ secret: "private-provider-details" }, { status });
    await assert.rejects(
      callImpexqHsnSandbox({ query: "rice" }),
      (error: Error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.ok(!JSON.stringify(error).includes("private-provider-details"));
        return true;
      },
    );
  }
});

test("rejects HTML, empty and non-sandbox successful responses", async () => {
  for (const body of [
    "<html>login</html>",
    "null",
    "[]",
    '{"hsnCode":"10063010"}',
  ]) {
    globalThis.fetch = async () => new Response(body, { status: 200 });
    await assert.rejects(callImpexqHsnSandbox({ query: "rice" }));
  }
});

test("FTA without explicit non-mock flag remains conservatively labelled mock", async () => {
  globalThis.fetch = async () => Response.json({ _sandbox: true });
  assert.equal((await callImpexqFtaSandbox({ destination: "uae" })).mock, true);
});

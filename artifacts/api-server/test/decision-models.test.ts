import assert from "node:assert/strict";
import { after, test } from "node:test";
import { intakeDecisionHint } from "../src/akif/decisionModels.ts";

const originalFetch = globalThis.fetch;
const originalLaya = process.env.AKIF_LAYA_URL;
const originalJev = process.env.TYPESAFE_API_KEY;
after(() => {
  globalThis.fetch = originalFetch;
  if (originalLaya === undefined) delete process.env.AKIF_LAYA_URL;
  else process.env.AKIF_LAYA_URL = originalLaya;
  if (originalJev === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = originalJev;
});

test("optional Laya failure falls through to Jev and rejects weak decisions", async () => {
  process.env.AKIF_LAYA_URL = "http://localhost:8000";
  process.env.TYPESAFE_API_KEY = "test-key";
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("localhost")) throw new Error("offline");
    return Response.json({ answers: { intent: { choice: "inquiry", confidence: 0.9 } } });
  };
  assert.equal(await intakeDecisionHint("Need copper"), "inquiry");
  assert.deepEqual(calls, ["http://localhost:8000/predict", "https://api.typesafe.ai/v1/systemone"]);
  globalThis.fetch = async () => Response.json({ answers: { intent: { choice: "inquiry", confidence: 0.2 } } });
  assert.equal(await intakeDecisionHint("hello"), null);
});

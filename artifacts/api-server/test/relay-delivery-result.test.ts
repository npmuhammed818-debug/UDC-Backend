import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { spawnSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { relayDeliveryFailureBody } from "../src/akif/relayDeliveryResult.ts";
test("an unknown outcome is not shown as a plain failure and does not invite a blind retry", () => {
  const b = relayDeliveryFailureBody("provider_outcome_unknown");
  assert.equal(b.outcomeUnknown, true); assert.equal(b.attemptNotAccepted, false);
  assert.match(b.message, /may already have/i); assert.match(b.message, /do not resend/i);
  assert.doesNotMatch(b.message, /safe to try again/i);
});
test("a definitive failure says this attempt was not accepted and tells the worker to check the item before retrying", () => {
  const b = relayDeliveryFailureBody("whatsapp_delivery_failed");
  assert.equal(b.outcomeUnknown, false); assert.equal(b.attemptNotAccepted, true);
  assert.match(b.message, /not accepted/i); assert.match(b.message, /check the conversation before you try again/i);
  assert.doesNotMatch(b.message, /safe to try again/i);
});
test("code linkage: the reply route builds its 502 from relayDeliveryFailureBody (source check, not a route run)", () => {
  const src = readFileSync(new URL("../src/routes/akifHumanRelay.ts", import.meta.url), "utf8");
  assert.match(src, /res\.status\(502\)\.json\(relayDeliveryFailureBody\(delivery\.reason\)\)/);
});
test("worker CLI against an isolated loopback stub prints the warning only for an unknown outcome", async () => {
  let reply: unknown = relayDeliveryFailureBody("provider_outcome_unknown");
  const srv = createServer((req, res) => { req.resume(); req.on("end", () => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify(reply)); }); });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = (srv.address() as { port: number }).port;
  const env = { ...process.env, UDC_RELAY_TEST_BASE: `http://127.0.0.1:${port}`, UDC_RELAY_TEST_SECRET: "stub-secret" };
  const run = () => new Promise<string>((resolve) => {
    const c = spawn(process.execPath, [new URL("../../../scripts/relay/worker.mjs", import.meta.url).pathname, "answer", "w1", "15550000000", "item1"], { env });
    let out = ""; c.stdout.on("data", (d) => (out += d)); c.on("close", () => resolve(out)); c.stdin.end("hello");
  });
  const unknown = await run();
  reply = relayDeliveryFailureBody("whatsapp_delivery_failed");
  const failed = await run();
  srv.close();
  assert.match(unknown, /502/); assert.match(unknown, /"outcomeUnknown":true/); assert.match(unknown, /WARNING: outcome unknown/);
  assert.match(failed, /"outcomeUnknown":false/); assert.doesNotMatch(failed, /WARNING/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Source guard: without exactly-one-hop proxy trust, req.ip is the proxy's
// address for every request, and all visitors share one auth rate-limit
// bucket (site-wide login lockout) - or, if set to true, a spoofed
// X-Forwarded-For header would bypass per-IP limits entirely.
test("app trusts exactly one proxy hop for client IPs", async () => {
  const src = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  assert.ok(src.includes('app.set("trust proxy", 1);'), "app.ts must set trust proxy to exactly 1 hop");
  assert.ok(!src.includes('app.set("trust proxy", true)'), "trust proxy true is spoofable");
});

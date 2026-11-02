import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SECURITY_HEADERS } from "../src/lib/securityHeaders.ts";

test("security headers cover sniffing, framing, referrer and downgrade attacks", () => {
  assert.equal(SECURITY_HEADERS["x-content-type-options"], "nosniff");
  assert.equal(SECURITY_HEADERS["x-frame-options"], "DENY");
  assert.equal(SECURITY_HEADERS["referrer-policy"], "no-referrer");
  assert.ok(SECURITY_HEADERS["strict-transport-security"]?.includes("max-age="));
});

test("the app installs the security headers middleware before routes", async () => {
  const src = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  const middleware = src.indexOf("SECURITY_HEADERS");
  const routes = src.indexOf('app.use("/api", router)');
  assert.ok(middleware > -1 && routes > -1 && middleware < routes,
    "security headers must be set before any route runs");
});

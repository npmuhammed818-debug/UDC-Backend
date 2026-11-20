import { test } from "node:test";
import assert from "node:assert/strict";
import { corsOriginAllowed, parseAllowedOrigins } from "../src/lib/corsOrigins.ts";

test("CORS: no Origin header (same-origin or server-to-server) is always allowed", () => {
  assert.equal(corsOriginAllowed(undefined, []), true);
  assert.equal(corsOriginAllowed(undefined, ["https://example.com"]), true);
});

test("CORS: browser origins are denied when no allowlist is configured", () => {
  assert.equal(corsOriginAllowed("https://evil.example", []), false);
  assert.equal(corsOriginAllowed("https://evil.example", parseAllowedOrigins(undefined)), false);
  assert.equal(corsOriginAllowed("https://evil.example", parseAllowedOrigins("")), false);
});

test("CORS: only exact allowlisted origins pass", () => {
  const allowed = parseAllowedOrigins("https://admin.example.com, https://app.example.com ,");
  assert.deepEqual(allowed, ["https://admin.example.com", "https://app.example.com"]);
  assert.equal(corsOriginAllowed("https://app.example.com", allowed), true);
  assert.equal(corsOriginAllowed("https://app.example.com.evil.example", allowed), false);
  assert.equal(corsOriginAllowed("http://app.example.com", allowed), false);
});

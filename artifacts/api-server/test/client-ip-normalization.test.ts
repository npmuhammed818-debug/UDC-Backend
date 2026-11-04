import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeClientIp } from "../src/auth/rateLimit.ts";

test("IPv4 addresses key on the full address", () => {
  assert.equal(normalizeClientIp("203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeClientIp("::ffff:203.0.113.7"), "203.0.113.7");
});

test("IPv6 addresses key on the /64 network so prefix rotation shares one budget", () => {
  const a = normalizeClientIp("2001:db8:abcd:1234:aaaa:bbbb:cccc:dddd");
  const b = normalizeClientIp("2001:db8:abcd:1234:1111:2222:3333:4444");
  const other = normalizeClientIp("2001:db8:abcd:9999:aaaa:bbbb:cccc:dddd");
  assert.equal(a, b);
  assert.notEqual(a, other);
  assert.ok(a.endsWith("::/64"));
});

test("zone ids and case are folded", () => {
  assert.equal(normalizeClientIp("FE80::1%eth0"), "fe80::1::/64");
});

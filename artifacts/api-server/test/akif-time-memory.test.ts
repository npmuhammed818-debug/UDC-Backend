import { test } from "node:test";
import assert from "node:assert/strict";
import { customerLocalTimeLine, factStorageBlock, isBrainMemoryWriteEnabled, isBrainTimeAwareEnabled } from "../src/akif/timeMemory.ts";

function withEnv(key: string, value: string | undefined, fn: () => void) {
  const old = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { fn(); } finally { if (old === undefined) delete process.env[key]; else process.env[key] = old; }
}

test("time line is off by default", () => {
  withEnv("AKIF_BRAIN_TIME_AWARE", undefined, () => {
    assert.equal(isBrainTimeAwareEnabled(), false);
    assert.equal(customerLocalTimeLine("India", new Date("2026-11-08T17:49:00Z")), null);
  });
});

test("time line uses the customer's single-zone country", () => {
  withEnv("AKIF_BRAIN_TIME_AWARE", "on", () => {
    const line = customerLocalTimeLine("India", new Date("2026-11-08T17:49:00Z"));
    assert.ok(line);
    assert.match(line!, /Asia\/Kolkata/);
    assert.match(line!, /11:19 PM/);
    // multi-zone and unknown countries get no line, never a guess
    assert.equal(customerLocalTimeLine("United States"), null);
    assert.equal(customerLocalTimeLine("Narnia"), null);
    assert.equal(customerLocalTimeLine(null), null);
  });
});

test("memory write flag is off by default", () => {
  withEnv("AKIF_BRAIN_MEMORY_WRITE", undefined, () => {
    assert.equal(isBrainMemoryWriteEnabled(), false);
  });
  withEnv("AKIF_BRAIN_MEMORY_WRITE", "on", () => {
    assert.equal(isBrainMemoryWriteEnabled(), true);
  });
});

test("fact guard blocks IDs, secrets and paragraphs, allows plain facts", () => {
  assert.match(factStorageBlock("Aadhaar 1234 5678 9012")!, /never note ID/i);
  assert.match(factStorageBlock("my passport is K1234567")!, /never note ID/i);
  assert.match(factStorageBlock("otp 482910")!, /never note ID/i);
  assert.match(factStorageBlock("x".repeat(301))!, /one short fact/i);
  assert.match(factStorageBlock("   ")!, /Nothing to note/i);
  assert.equal(factStorageBlock("Prefers CIF quotes and evening calls"), null);
});

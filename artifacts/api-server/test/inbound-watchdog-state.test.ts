import test from "node:test";
import assert from "node:assert/strict";
import { pendingInbound, noteInboundForWatchdog, noteOutboundForWatchdog, lastOutboundAt, outboundInFlight, beginOutboundForWatchdog, endOutboundForWatchdog } from "../src/whatsapp/inboundWatchdogState.ts";

test("every inbound kind except a reaction is tracked, including media", () => {
  pendingInbound.clear();
  noteInboundForWatchdog("+15550009001", "m1", "text", "hello");
  noteInboundForWatchdog("+15550009001", "m2", "document", "");
  noteInboundForWatchdog("+15550009001", "m3", "audio", "");
  noteInboundForWatchdog("+15550009001", "m4", "reaction", "");
  assert.deepEqual([...pendingInbound.keys()], ["m1", "m2", "m3"]);
});
test("an outbound to the same phone answers all its pending messages and no other phone's", () => {
  pendingInbound.clear();
  noteInboundForWatchdog("+15550009001", "a", "text", "x");
  noteInboundForWatchdog("+15550009002", "b", "text", "y");
  noteOutboundForWatchdog("+15550009001");
  assert.deepEqual([...pendingInbound.keys()], ["b"]);
});
test("tracking is capped so memory cannot grow without bound", () => {
  pendingInbound.clear();
  for (let i = 0; i < 600; i++) noteInboundForWatchdog("+1555000" + (1000 + i), "id" + i, "text", "x");
  assert.ok(pendingInbound.size <= 500);
  assert.ok(!pendingInbound.has("id0"));
});
test("an outbound is timestamped per phone so the watchdog can drop its own reply when someone answered first", () => {
  lastOutboundAt.clear();
  const before = Date.now();
  noteOutboundForWatchdog("+15550009001");
  assert.ok((lastOutboundAt.get("+15550009001") ?? 0) >= before);
  assert.equal(lastOutboundAt.get("+15550009002"), undefined);
});
test("in-flight sends are counted per phone and always released", () => {
  outboundInFlight.clear();
  beginOutboundForWatchdog("+15550009003"); beginOutboundForWatchdog("+15550009003");
  assert.equal(outboundInFlight.get("+15550009003"), 2);
  endOutboundForWatchdog("+15550009003");
  assert.equal(outboundInFlight.get("+15550009003"), 1);
  endOutboundForWatchdog("+15550009003");
  assert.equal(outboundInFlight.has("+15550009003"), false);
  endOutboundForWatchdog("+15550009003");
  assert.equal(outboundInFlight.has("+15550009003"), false);
});

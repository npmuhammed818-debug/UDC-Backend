import test from "node:test";
import assert from "node:assert/strict";
import { pendingInbound, noteInboundForWatchdog, noteOutboundForWatchdog } from "../src/whatsapp/inboundWatchdogState.ts";

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

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachPoolErrorLogger } from "../../../lib/db/src/connection.ts";

test("an idle pooled client error is logged instead of crashing the process", () => {
  const pool = new EventEmitter();
  const lines: string[] = [];
  attachPoolErrorLogger(pool as never, (line) => lines.push(line));
  assert.doesNotThrow(() => pool.emit("error", Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" })));
  const row = JSON.parse(lines[0]);
  assert.equal(row.event, "db_pool_idle_client_error");
  assert.equal(row.code, "57P01");
});

test("without the listener the same event would be uncaught (guard is what prevents the crash)", () => {
  const bare = new EventEmitter();
  assert.throws(() => bare.emit("error", new Error("x")));
});

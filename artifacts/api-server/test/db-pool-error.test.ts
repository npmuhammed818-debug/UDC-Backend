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

import { redactForLog as redactApi } from "../src/lib/redactForLog.ts";
import { redactForLog as redactDb } from "../../../lib/db/src/connection.ts";
for (const [name, fn] of [["api", redactApi], ["db", redactDb]] as const) {
  test(`${name} log redaction removes connection strings, credentials and tokens`, () => {
    const dirty = "connect failed postgresql://postgres.abc:Sup3rSecret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres password=hunter2 Bearer abc.def.ghi key: re_AbCdEfGhIjKlMnOpQrStUvWxYz123456 sslmode=verify-full";
    const out = fn(dirty);
    for (const leak of ["Sup3rSecret", "pooler.supabase.com", "hunter2", "re_AbCd", "abc.def.ghi"]) assert.ok(!out.includes(leak), leak);
    assert.ok(out.includes("connect failed"));
    assert.ok(fn("x".repeat(500)).length <= 200);
  });
}

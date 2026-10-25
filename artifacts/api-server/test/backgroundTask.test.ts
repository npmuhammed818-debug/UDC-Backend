import assert from "node:assert/strict";
import { test } from "node:test";
import { runBackgroundTask } from "../src/lib/backgroundTask.ts";

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

test("background poll reports a rejected database task once without crashing", async () => {
  let warnings = 0;
  runBackgroundTask(
    async () => { throw new Error("simulated database unavailable"); },
    () => { warnings++; },
  );
  await nextTurn();
  assert.equal(warnings, 1);
});

test("background poll catches synchronous task setup failures", async () => {
  let warnings = 0;
  runBackgroundTask(
    () => { throw new Error("simulated synchronous failure"); },
    () => { warnings++; },
  );
  await nextTurn();
  assert.equal(warnings, 1);
});

test("background poll contains an exception raised while reporting failure", async () => {
  runBackgroundTask(
    async () => { throw new Error("simulated database unavailable"); },
    () => { throw new Error("simulated logger failure"); },
  );
  await nextTurn();
});

test("a later healthy background poll still runs after a failed poll", async () => {
  let warnings = 0;
  let successes = 0;
  runBackgroundTask(async () => { throw new Error("first poll failed"); }, () => { warnings++; });
  await nextTurn();
  runBackgroundTask(async () => { successes++; }, () => { warnings++; });
  await nextTurn();
  assert.equal(warnings, 1);
  assert.equal(successes, 1);
});

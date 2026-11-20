import {test} from "node:test";
import assert from "node:assert/strict";
import {schedulerKeyAllowed,stagingFakeTracker} from "../src/tracking/shipmentWatchScheduler.ts";

test("scheduler key: exact match only, disabled without env, never length-leaky",()=>{
  const env={UDC_SHIPMENT_WATCH_SCHEDULER_KEY:"sched-secret-123"};
  assert.equal(schedulerKeyAllowed("sched-secret-123",env),true);
  assert.equal(schedulerKeyAllowed("sched-secret-124",env),false);
  assert.equal(schedulerKeyAllowed("sched-secret-123 ",env),false);
  assert.equal(schedulerKeyAllowed("",env),false);
  assert.equal(schedulerKeyAllowed(undefined,env),false);
  assert.equal(schedulerKeyAllowed("a",env),false); // different length, timing-safe via hashing
  assert.equal(schedulerKeyAllowed("sched-secret-123",{}),false); // no env, no access
  assert.equal(schedulerKeyAllowed("anything",{}),false);
});

test("staging fake tracker: staging-only, validated, never silent",async()=>{
  const good={UDC_APP_ENV:"staging",UDC_SHIPMENT_WATCH_FAKE_EVENTS:JSON.stringify([{time:"2026-10-28T06:00:00Z",description:"Delivered"}])};
  const fake=stagingFakeTracker(good);
  assert.ok(fake&&"tracker" in fake);
  assert.equal(fake.tracker.name,"staging-fake");
  assert.deepEqual(await fake.tracker.fetchEvents("any"),[{time:"2026-10-28T06:00:00Z",description:"Delivered"}]);
  // ignored outside staging, even with the flag set
  assert.equal(stagingFakeTracker({UDC_APP_ENV:"production",UDC_SHIPMENT_WATCH_FAKE_EVENTS:good.UDC_SHIPMENT_WATCH_FAKE_EVENTS}),null);
  assert.equal(stagingFakeTracker({UDC_APP_ENV:"staging"}),null);
  // invalid flag is an explicit error, not a fall-through to the real tracker
  assert.deepEqual(stagingFakeTracker({UDC_APP_ENV:"staging",UDC_SHIPMENT_WATCH_FAKE_EVENTS:"not-json"}),{error:"fake_events_invalid"});
  assert.deepEqual(stagingFakeTracker({UDC_APP_ENV:"staging",UDC_SHIPMENT_WATCH_FAKE_EVENTS:JSON.stringify([{time:1}])}),{error:"fake_events_invalid"});
});

test("run endpoint accepts the scheduler key and the runner respects the fake switch",async()=>{
  const {readFile}=await import("node:fs/promises");
  const admin=await readFile(new URL("../src/routes/admin.ts",import.meta.url),"utf8");
  assert.ok(admin.includes('req.get("x-scheduler-key")'),"route checks the scheduler key header");
  assert.ok(admin.includes('router.post("/admin/tracking/shipment-watch/run",adminOrSchedulerKey'),"key opens only the poll route");
  assert.equal((admin.match(/schedulerKeyAllowed\(/g)||[]).length,1,"exactly one route accepts the key");
  const runner=await readFile(new URL("../src/tracking/shipmentWatchRunner.ts",import.meta.url),"utf8");
  assert.ok(runner.includes("stagingFakeTracker()"),"in-process runner honors the fake switch");
  assert.ok(runner.includes('process.env.UDC_SHIPMENT_WATCH_ENABLED!=="true"'),"runner still off by default");
});

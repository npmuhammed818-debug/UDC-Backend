import { test } from "node:test";
import assert from "node:assert/strict";
import { queueAdminReviewAlert, adminReviewAlertTest } from "../src/whatsapp/adminReviewAlerts.ts";

const OWNER = "917022032531";

test("admin review alerts: gated, one per event, bursts collapse, no customer private data", async (t) => {
  const sent: Array<{ to: string; body: string }> = [];
  const spy = async (to: string, body: string) => { sent.push({ to, body }); };
  const oldPhone = process.env.UDC_ADMIN_ALERT_PHONE;
  const reset = () => { adminReviewAlertTest.reset(); sent.length = 0; };
  try {
    await t.test("disabled without the owner phone env", async () => {
      delete process.env.UDC_ADMIN_ALERT_PHONE; reset();
      queueAdminReviewAlert("agent registration", "QA Person");
      assert.equal(adminReviewAlertTest.size(), 0);
      await adminReviewAlertTest.flush(spy);
      assert.equal(sent.length, 0);
    });
    await t.test("single event sends one short plain message to the owner only", async () => {
      process.env.UDC_ADMIN_ALERT_PHONE = OWNER; reset();
      queueAdminReviewAlert("agent registration", "QA Person");
      await adminReviewAlertTest.flush(spy);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, OWNER);
      assert.match(sent[0].body, /agent registration \(QA Person\)/);
      assert.match(sent[0].body, /admin panel/);
      assert.ok(sent[0].body.length < 200);
      assert.doesNotMatch(sent[0].body, /@|\d{7,}/, "no emails or customer phone numbers");
    });
    await t.test("a burst collapses into one summary", async () => {
      process.env.UDC_ADMIN_ALERT_PHONE = OWNER; reset();
      queueAdminReviewAlert("agent registration", "QA Person");
      queueAdminReviewAlert("company verification", "QA Exports Ltd");
      queueAdminReviewAlert("referral");
      assert.equal(adminReviewAlertTest.size(), 3);
      await adminReviewAlertTest.flush(spy);
      assert.equal(sent.length, 1, "one message, not three");
      assert.match(sent[0].body, /3 new reviews waiting/);
      assert.match(sent[0].body, /agent registration/);
      assert.match(sent[0].body, /company verification/);
      assert.match(sent[0].body, /referral/);
    });
    await t.test("send failure is swallowed", async () => {
      process.env.UDC_ADMIN_ALERT_PHONE = OWNER; reset();
      queueAdminReviewAlert("offer review");
      await adminReviewAlertTest.flush(async () => { throw new Error("synthetic_send_failure"); });
    });
    await t.test("queueing never throws without env or input", () => {
      delete process.env.UDC_ADMIN_ALERT_PHONE; reset();
      assert.doesNotThrow(() => queueAdminReviewAlert("offer review"));
    });
  } finally {
    adminReviewAlertTest.reset();
    if (oldPhone === undefined) delete process.env.UDC_ADMIN_ALERT_PHONE; else process.env.UDC_ADMIN_ALERT_PHONE = oldPhone;
  }
});

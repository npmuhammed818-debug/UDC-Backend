import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildNoticeBody, createIncidentSchema, notifySchema } from "../src/incidents/incident.ts";

test("incident input is strict", () => {
  const ok = { title: "Mailbox exposure", description: "A mailbox export was shared in error.", severity: "high", affectedUserIds: ["11111111-2222-4333-8444-555555555555"] };
  assert.ok(createIncidentSchema.safeParse(ok).success);
  for (const bad of [{ ...ok, severity: "critical" }, { ...ok, title: "x" }, { ...ok, affectedUserIds: ["abc"] }, { ...ok, extra: 1 }]) assert.ok(!createIncidentSchema.safeParse(bad).success);
  assert.ok(!notifySchema.safeParse({ message: "short" }).success);
});
test("notice carries admin wording plus support line", () => {
  const b = buildNoticeBody("We found that some account details were exposed on 25 Oct.", "help@example.com");
  assert.match(b, /exposed on 25 Oct/); assert.match(b, /help@example\.com/);
});
test("routes are admin-only and do not send WhatsApp or email", async () => {
  const r = await readFile(new URL("../src/routes/adminIncidents.ts", import.meta.url), "utf8");
  assert.equal((r.match(/requireRole\("admin"\)/g) || []).length, 3);
  assert.ok(!/sendWhatsApp|sendMail|sendEmail/.test(r));
  assert.ok(r.includes("incident_users_notified"));
});

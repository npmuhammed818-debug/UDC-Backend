import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ACK_WINDOW_MS, acknowledgementReply, grievanceDeadline, grievanceStatus, isGrievance } from "../src/grievance/grievance.ts";

test("detects complaints without catching trade talk", () => {
  for (const t of ["complaint", "Complaint: seller never replied", "grievance about fees", "I want to file a complaint", "please raise a grievance"]) assert.ok(isGrievance(t), t);
  for (const t of ["hello", "I need copper", "no complaints so far", "what is your complaint policy", "", undefined]) assert.ok(!isGrievance(t), String(t));
});
test("48 hour deadline, honest acknowledgement, overdue only while open", () => {
  const at = new Date("2026-10-25T10:00:00Z");
  const due = grievanceDeadline(at);
  assert.equal(due.getTime() - at.getTime(), ACK_WINDOW_MS);
  const r = acknowledgementReply("ABCD1234", due);
  assert.match(r, /ABCD1234/); assert.match(r, /48 hours/);
  assert.ok(!/resolved|fixed/i.test(r));
  const later = new Date(at.getTime() + 49 * 3_600_000);
  assert.equal(grievanceStatus(at, due, null, later).overdue, true);
  assert.equal(grievanceStatus(at, due, "responded", later).overdue, false);
  assert.equal(grievanceStatus(at, due, null, new Date(at.getTime() + 3_600_000)).overdue, false);
});
test("admin routes are admin-only and webhook scrubs Aadhaar before logging", async () => {
  const r = await readFile(new URL("../src/routes/adminGrievances.ts", import.meta.url), "utf8");
  assert.equal((r.match(/requireRole\("admin"\)/g) || []).length, 2);
  const w = await readFile(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");
  assert.ok(w.includes("scrubAadhaar(message.text.body)"));
});

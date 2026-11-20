import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Wiring guards: both upload endpoints enforce a per-user daily quota, and
// company creation is closed to agents. Behavioural tests need a staging DB.
test("deal document uploads enforce a per-user daily quota", async () => {
  const src = await readFile(new URL("../src/routes/deals.ts", import.meta.url), "utf8");
  const route = src.slice(src.indexOf('"/deals/:dealId/documents/upload"'));
  assert.ok(route.includes("count(*)::int as n from documents where uploaded_by="),
    "deal uploads must count the user's last-24h uploads");
  assert.ok(route.includes("upload_quota_exceeded"), "over-quota uploads get 429");
});

test("company document uploads enforce a per-user daily quota", async () => {
  const src = await readFile(new URL("../src/routes/company.ts", import.meta.url), "utf8");
  const route = src.slice(src.indexOf('"/company/documents/upload"'));
  assert.ok(route.includes("count(*)::int as n from company_verification_documents where uploaded_by="),
    "company uploads must count the user's last-24h uploads");
  assert.ok(route.includes("upload_quota_exceeded"), "over-quota uploads get 429");
});

test("agents cannot create company records", async () => {
  const src = await readFile(new URL("../src/routes/company.ts", import.meta.url), "utf8");
  const route = src.slice(src.indexOf('router.post("/company"'));
  assert.ok(route.slice(0, 400).includes('role === "agent"'),
    "POST /company must reject agent accounts");
});

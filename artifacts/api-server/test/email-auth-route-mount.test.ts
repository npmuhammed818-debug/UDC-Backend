import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Regression guard: the email-auth router must be mounted in the root router,
// otherwise /api/auth/password/recovery/* 404s into the SPA HTML fallback and
// the recovery page fails with "Unexpected token '<'". Surfaced 2026-11-02.
test("email-auth router is imported and mounted in the root router", async () => {
  const src = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.ok(/import emailAuthRouter from ["']\.\/emailAuth["'];/.test(src), "emailAuth router import must exist");
  assert.ok(/router\.use\(emailAuthRouter\);/.test(src), "emailAuth router must be mounted");
});

test("email-auth router serves the password recovery endpoints the page calls", async () => {
  const src = await readFile(new URL("../src/routes/emailAuth.ts", import.meta.url), "utf8");
  assert.ok(src.includes('"password/recovery"'), "recovery request/confirm purposes must be routed");
  assert.ok(src.includes('`/auth/${purpose}/request`'), "the request endpoint must exist");
  assert.ok(src.includes('"/auth/password/recovery/confirm"'), "the confirm endpoint must exist");
});

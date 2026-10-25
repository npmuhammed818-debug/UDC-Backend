import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { newEmailCode } from "../src/auth/emailCodes.ts";

const read = (p: string) => readFile(new URL(p, import.meta.url), "utf8");

test("OTP codes are six digits in the generator, API spec, generated validators and web form", async () => {
  for (let i = 0; i < 200; i++) assert.match(newEmailCode(), /^\d{6}$/);
  const spec = await read("../../../lib/api-spec/openapi.yaml");
  const generated = await read("../../../lib/api-zod/src/generated/api.ts");
  const form = await read("../../udc-app/src/components/email-auth.tsx");
  assert.ok(!/pattern: '\^\[0-9\]\{8\}\$'/.test(spec));
  assert.ok(!/CodeRegExp = new RegExp\('\^\[0-9\]\{8\}\$'\)/.test(generated), "generated validator still expects 8 digits");
  assert.equal((generated.match(/CodeRegExp = new RegExp\('\^\[0-9\]\{6\}\$'\)/g) ?? []).length, 2);
  assert.ok(!/maxLength=\{8\}/.test(form), "web OTP input must not allow 8 characters");
  assert.equal((form.match(/maxLength=\{6\}/g) ?? []).length, 2);
});

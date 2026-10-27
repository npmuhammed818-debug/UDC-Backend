import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { businessEmail } from "../src/whatsapp/registrationEmail.ts";
test("personal email exception is off by default and only for the listed phone", () => {
  delete process.env.UDC_PERSONAL_EMAIL_PHONE_HASHES;
  assert.equal(businessEmail("a@gmail.com", "919999999999"), false);
  process.env.UDC_PERSONAL_EMAIL_PHONE_HASHES = createHash("sha256").update("919999999999").digest("hex");
  assert.equal(businessEmail("a@gmail.com", "+91 99999 99999"), true);
  assert.equal(businessEmail("a@gmail.com", "918888888888"), false);
  assert.equal(businessEmail("a@gmail.com"), false);
  assert.equal(businessEmail("a@company.com", "918888888888"), true);
  delete process.env.UDC_PERSONAL_EMAIL_PHONE_HASHES;
});

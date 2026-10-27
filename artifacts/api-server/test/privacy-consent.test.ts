import assert from "node:assert/strict";
import { test } from "node:test";
import { registrationSchema } from "../src/privacy/registration.ts";
import {
  deletionRequestSchema,
  requestReviewSchema,
} from "../src/privacy/requests.ts";
import { policies, renderPolicy } from "../src/privacy/policies.ts";
const input = {
  full_name: "Test Trader",
  email: "test@example.com",
  company_name: "Test Trading Co",
  password: "SafePassword123!",
  role: "buyer",
  accepted_terms: true,
  adult_business_user: true,
};
test("registration requires explicit adult and terms confirmations on the server", () => {
  assert.equal(registrationSchema.safeParse(input).success, true);
  for (const field of ["accepted_terms", "adult_business_user"]) {
    for (const value of [false, undefined, "true", 1]) {
      assert.equal(
        registrationSchema.safeParse({ ...input, [field]: value }).success,
        false,
      );
    }
  }
  assert.equal(
    registrationSchema.safeParse({ ...input, role: "admin" }).success,
    false,
  );
});
test("deletion requests cannot supply another user or skip confirmation", () => {
  assert.equal(
    deletionRequestSchema.safeParse({ confirmed: true }).success,
    true,
  );
  assert.equal(
    deletionRequestSchema.safeParse({ confirmed: false }).success,
    false,
  );
  assert.equal(
    deletionRequestSchema.safeParse({ confirmed: true, userId: "other-user" })
      .success,
    false,
  );
});
test("review requires an explained outcome and only supported states", () => {
  assert.equal(
    requestReviewSchema.safeParse({
      status: "resolved",
      outcome: "Review complete: retention explained.",
    }).success,
    true,
  );
  for (const input of [
    { status: "deleted", outcome: "Deleted everything" },
    { status: "resolved", outcome: "" },
    { status: "in_review", outcome: "a".repeat(1001) },
  ]) {
    assert.equal(requestReviewSchema.safeParse(input).success, false);
  }
});
test("policy pages have semantic navigation and escaped titles", () => {
  for (const [title, body] of Object.values(policies)) {
    const html = renderPolicy(title, body);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<main>/);
    assert.match(html, /aria-label="Policies"/);
    assert.match(html, /mailto:service@updowncircle.site/);
    assert.doesNotMatch(html, /<script|fonts.googleapis|guaranteed safe/i);
  }
  assert.match(renderPolicy("<script>", ""), /&lt;script&gt;/);
});

import {
  decideWhatsAppConsent as decide,
  privacyCommand,
} from "../src/privacy/whatsappConsent.ts";
import { POLICY_VERSION } from "../src/privacy/policies.ts";
const decideWhatsAppConsent = (input: Parameters<typeof decide>[0]) =>
  decide(input, POLICY_VERSION);
test("WhatsApp requires a current notice and exact adult/terms agreement before trade processing", () => {
  assert.equal(
    decideWhatsAppConsent({ text: "AGREE", state: "none" }),
    "notice",
  );
  assert.equal(
    decideWhatsAppConsent({
      text: "yes",
      state: "notice_sent",
      version: POLICY_VERSION,
    }),
    "notice",
  );
  assert.equal(
    decideWhatsAppConsent({
      text: " agree ",
      state: "notice_sent",
      version: POLICY_VERSION,
    }),
    "accept",
  );
  assert.equal(
    decideWhatsAppConsent({
      text: "100 MT copper",
      state: "accepted",
      version: POLICY_VERSION,
    }),
    "continue",
  );
  assert.equal(
    decideWhatsAppConsent({ state: "accepted", version: "old" }),
    "notice",
  );
});
test("privacy commands cannot be triggered by unrelated negotiation messages", () => {
  assert.equal(privacyCommand(" stop "), "stop");
  assert.equal(privacyCommand("DELETE MY DATA"), "deletion");
  assert.equal(privacyCommand("Privacy"), "privacy");
  assert.equal(privacyCommand("stop the shipment"), null);
});
test("buyers and sellers need a company email on web registration; agents may use personal email", () => {
  for (const role of ["buyer", "seller"]) {
    assert.equal(registrationSchema.safeParse({ ...input, role, email: "someone@gmail.com" }).success, false, role);
    assert.equal(registrationSchema.safeParse({ ...input, role, company_name: "Acme Trading", email: "someone@acme-trading.com" }).success, true, role);
  }
  assert.equal(registrationSchema.safeParse({ ...input, role: "agent", email: "someone@gmail.com" }).success, true);
});

test("company name is required for buyers and sellers, optional for agents", () => {
  const { company_name: _omit, ...noCompany } = input;
  const ok = { ...noCompany, email: "someone@acme-trading.com" };
  for (const role of ["buyer", "seller"]) {
    assert.equal(registrationSchema.safeParse({ ...ok, role }).success, false, role);
    assert.equal(registrationSchema.safeParse({ ...ok, role, company_name: "A" }).success, false, role);
    assert.equal(registrationSchema.safeParse({ ...ok, role, company_name: "Acme Trading" }).success, true, role);
  }
  assert.equal(registrationSchema.safeParse({ ...ok, role: "agent" }).success, true);
});

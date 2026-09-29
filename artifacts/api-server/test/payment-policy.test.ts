import assert from "node:assert/strict";
import test from "node:test";
import { hasConflictingPaymentTerms, udcPaymentTerms } from "../src/marketplace/paymentPolicy.ts";

test("trade intake keeps UDC's DLC terms and rejects alternate payment routes", () => {
  assert.equal(hasConflictingPaymentTerms(undefined), false);
  assert.equal(hasConflictingPaymentTerms(""), false);
  assert.equal(hasConflictingPaymentTerms(udcPaymentTerms), false);
  assert.equal(hasConflictingPaymentTerms("MT103 after delivery"), true);
  assert.equal(hasConflictingPaymentTerms("Cash on delivery"), true);
});

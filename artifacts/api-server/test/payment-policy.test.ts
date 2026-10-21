import assert from "node:assert/strict";
import test from "node:test";
import { hasConflictingPaymentTerms, udcPaymentTerms } from "../src/marketplace/paymentPolicy.ts";

test("payment policy distinguishes UDC recommendation from proposed alternatives", () => {
  assert.equal(hasConflictingPaymentTerms(undefined), false);
  assert.equal(hasConflictingPaymentTerms(""), false);
  assert.equal(hasConflictingPaymentTerms(udcPaymentTerms), false);
  assert.equal(hasConflictingPaymentTerms("MT103 after delivery"), true);
  assert.equal(hasConflictingPaymentTerms("Cash on delivery"), true);
});

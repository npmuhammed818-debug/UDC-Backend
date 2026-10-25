import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateCommissionAmount } from "../src/referrals/commissionAmount.ts";
import { minorUnitDigits, commissionAmountFitsStorage } from "../src/referrals/currencyPrecision.ts";

const deal = { quantity: "100", unit: "MT", agreedPrice: "5900" };
test("minor units: legitimate trade currencies are supported; unknown codes are not guessed", () => {
  for (const c of ["USD", "EUR", "INR", "AED", "SAR", "QAR"]) assert.equal(minorUnitDigits(c), 2, c);
  assert.equal(minorUnitDigits("JPY"), 0);
  for (const c of ["OMR", "BHD", "KWD"]) assert.equal(minorUnitDigits(c), 3, c);
  assert.equal(minorUnitDigits("omr"), 3);
  assert.equal(minorUnitDigits("XXX"), null);
  assert.equal(minorUnitDigits(""), null);
});
test("manual commissions are preserved exactly in the currency's units; excess precision is rejected, never rounded", () => {
  const fixed = (amount: string, currency: string) => calculateCommissionAmount({ ...deal, method: "fixed_amount", amount, currency });
  assert.equal(fixed("1500.50", "USD"), "1500.50");
  assert.equal(fixed("1500", "USD"), "1500.00");
  assert.equal(fixed("250000", "JPY"), "250000");
  assert.equal(fixed("1500.125", "OMR"), "1500.125");
  assert.equal(fixed("1500.10", "OMR"), "1500.100");
  assert.throws(() => fixed("1.005", "USD"), /precision_exceeds_currency/);
  assert.throws(() => fixed("100.5", "JPY"), /precision_exceeds_currency/);
  assert.throws(() => fixed("1.0005", "OMR"), /precision_exceeds_currency/);
  assert.equal(fixed("1.500", "USD"), "1.50"); // trailing zeros are not extra precision
  assert.throws(() => fixed("100", "XXX"), /unsupported_commission_currency/);
});
test("calculated commissions round once to the currency's minor units", () => {
  const pct = (price: string, rate: string, currency: string) => calculateCommissionAmount({ method: "percentage", quantity: "1", unit: "MT", agreedPrice: price, rate, currency });
  assert.equal(pct("12345.67", "1", "USD"), "123.46"); // 123.4567 -> 123.46
  assert.equal(pct("12345", "1", "JPY"), "123"); // 123.45 -> 123 (0 decimals)
  assert.equal(pct("12345.678", "1", "OMR"), "123.457"); // 123.45678 -> 123.457
  assert.equal(pct("1000", "2", "AED"), "20.00");
});
test("legacy callers without a currency keep the previous 2-decimal behaviour (existing deal records unchanged)", () => {
  assert.equal(calculateCommissionAmount({ ...deal, method: "percentage", rate: "1.25" }), "7375.00");
  assert.equal(calculateCommissionAmount({ ...deal, method: "fixed_amount", amount: "1.005" }), "1.01");
});
test("storage guard: the 2-decimal column can hold JPY and 2-decimal amounts, and 3-decimal amounts only when trailing digits are zero", () => {
  for (const ok of ["123", "123.45", "123.450", "123.400"]) assert.equal(commissionAmountFitsStorage(ok), true, ok);
  for (const bad of ["123.451", "0.001", "1500.125"]) assert.equal(commissionAmountFitsStorage(bad), false, bad);
});
test("storage digits default to 2 and only switch to 3 through the explicit post-migration flag", async () => {
  const { commissionStorageDigits } = await import("../src/referrals/currencyPrecision.ts");
  assert.equal(commissionStorageDigits({}), 2);
  assert.equal(commissionStorageDigits({ UDC_COMMISSION_STORAGE_DIGITS: "3" }), 3);
  for (const v of ["", "2", "4", "true", "03"]) assert.equal(commissionStorageDigits({ UDC_COMMISSION_STORAGE_DIGITS: v }), 2, v);
  assert.equal(commissionAmountFitsStorage("1500.125", 2), false);
  assert.equal(commissionAmountFitsStorage("1500.125", 3), true);
  assert.equal(commissionAmountFitsStorage("1500.1255", 3), false);
  assert.equal(commissionAmountFitsStorage("250000", 3), true);
});

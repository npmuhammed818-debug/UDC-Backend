import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDefaultSellerRate, agentPoolFromReceived } from "../src/referrals/defaultCommissionRule.ts";

const base = { invoiceDate: "2026-10-20" };
test("INR invoices: 2% below INR 25 lakh, 1% at or above (exactly at the threshold is 1%)", () => {
  assert.deepEqual(selectDefaultSellerRate({ ...base, invoiceCurrency: "INR", invoiceValue: "2499999.99" }), { status: "rate", ratePercent: "2", invoiceValueInr: "2499999.99", basis: "inr_invoice" });
  assert.equal((selectDefaultSellerRate({ ...base, invoiceCurrency: "INR", invoiceValue: "2500000" }) as any).ratePercent, "1");
  assert.equal((selectDefaultSellerRate({ ...base, invoiceCurrency: "INR", invoiceValue: "9000000" }) as any).ratePercent, "1");
});
test("foreign invoices use the supplied RBI reference rate dated the invoice date", () => {
  const ok = { ...base, invoiceCurrency: "USD", rbiReferenceRateDate: "2026-10-20" };
  // 29,000 x 83.5 = 24,21,500 INR -> below 25 lakh -> 2%
  const low = selectDefaultSellerRate({ ...ok, invoiceValue: "29000", rbiReferenceRateInrPerUnit: "83.5" }) as any;
  assert.equal(low.ratePercent, "2"); assert.equal(low.invoiceValueInr, "2421500.00"); assert.equal(low.basis, "rbi_reference_rate_on_invoice_date");
  // 30,000 x 83.5 = 25,05,000 INR -> 1%
  assert.equal((selectDefaultSellerRate({ ...ok, invoiceValue: "30000", rbiReferenceRateInrPerUnit: "83.5" }) as any).ratePercent, "1");
  // the rate decides which side of the threshold: same USD value, different rate
  assert.equal((selectDefaultSellerRate({ ...ok, invoiceValue: "30000", rbiReferenceRateInrPerUnit: "83.3" }) as any).ratePercent, "2");
});
test("missing, invalid or wrongly dated inputs go to manual review, never a guess", () => {
  const usd = { ...base, invoiceCurrency: "USD", invoiceValue: "30000" };
  assert.deepEqual(selectDefaultSellerRate(usd), { status: "manual_review", reason: "rbi_rate_missing" });
  assert.deepEqual(selectDefaultSellerRate({ ...usd, rbiReferenceRateInrPerUnit: "83.5" }), { status: "manual_review", reason: "rbi_rate_missing" });
  assert.deepEqual(selectDefaultSellerRate({ ...usd, rbiReferenceRateInrPerUnit: "83.5", rbiReferenceRateDate: "2026-10-19" }), { status: "manual_review", reason: "rbi_rate_date_not_invoice_date" });
  assert.deepEqual(selectDefaultSellerRate({ ...usd, rbiReferenceRateInrPerUnit: "0", rbiReferenceRateDate: base.invoiceDate }), { status: "manual_review", reason: "rbi_rate_invalid" });
  assert.deepEqual(selectDefaultSellerRate({ ...usd, invoiceCurrency: "usd" }), { status: "manual_review", reason: "invalid_currency" });
  assert.deepEqual(selectDefaultSellerRate({ ...usd, invoiceValue: "-5" }), { status: "manual_review", reason: "invalid_invoice_value" });
  assert.deepEqual(selectDefaultSellerRate({ ...usd, invoiceDate: "20-10-2026" }), { status: "manual_review", reason: "invalid_invoice_date" });
});
test("agent pool is half of the commission actually received, rounded once half up to cents", () => {
  assert.equal(agentPoolFromReceived("1000.00"), "500.00");
  assert.equal(agentPoolFromReceived("0.03"), "0.02");
  assert.throws(() => agentPoolFromReceived("0"));
});

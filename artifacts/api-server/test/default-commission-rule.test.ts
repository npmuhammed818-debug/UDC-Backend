import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDefaultSellerRate, agentPoolFromReceived, buildDefaultCommissionPreview } from "../src/referrals/defaultCommissionRule.ts";

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
test("agent pool: half of received, in the currency's own minor units, rounded once, no silent precision loss", () => {
  assert.equal(agentPoolFromReceived("1000.00", "USD"), "500.00");
  assert.equal(agentPoolFromReceived("0.03", "INR"), "0.02");
  assert.equal(agentPoolFromReceived("10.01", "USD"), "5.01");
  assert.equal(agentPoolFromReceived("100001", "JPY"), "50001"); // 0 decimals, odd unit rounds half up
  assert.equal(agentPoolFromReceived("10.005", "OMR"), "5.003"); // 3 decimals
  assert.throws(() => agentPoolFromReceived("10.005", "USD"), /precision_exceeds_currency/);
  assert.throws(() => agentPoolFromReceived("100.5", "JPY"), /precision_exceeds_currency/);
  assert.throws(() => agentPoolFromReceived("100", "XXX"), /unsupported_commission_currency/);
  assert.throws(() => agentPoolFromReceived("0", "USD"));
});
test("preview builder: estimate vs actual value, manual review, unsupported currency, currency precision", () => {
  const usd = { quantity: "100", unit: "MT", agreedPrice: "300", currency: "usd" }; // estimate 30,000 USD
  const rate = { invoiceDate: "2026-10-20", rbiReferenceRateInrPerUnit: "83.5", rbiReferenceRateDate: "2026-10-20" };
  const est: any = buildDefaultCommissionPreview(usd, rate);
  assert.equal(est.status, "rate"); assert.equal(est.ratePercent, "1"); assert.equal(est.commissionAmount, "300.00");
  assert.equal(est.requiresInvoiceConfirmation, true); assert.equal(est.valueBasis, "estimate_quantity_x_agreed_price"); assert.equal(est.commissionCurrency, "USD");
  const act: any = buildDefaultCommissionPreview(usd, { ...rate, actualInvoiceValue: "29000" });
  assert.equal(act.ratePercent, "2"); assert.equal(act.commissionAmount, "580.00"); assert.equal(act.requiresInvoiceConfirmation, false);
  const mr: any = buildDefaultCommissionPreview(usd, { invoiceDate: "2026-10-20" });
  assert.equal(mr.status, "manual_review"); assert.equal(mr.reason, "rbi_rate_missing"); assert.equal("commissionAmount" in mr, false);
  // JPY: 0 decimals; 5,000,000 JPY x 0.55 = 2,750,000 INR -> 1% = 50,000 JPY
  const jpy: any = buildDefaultCommissionPreview({ quantity: "1", unit: "MT", agreedPrice: "5000000", currency: "JPY" }, { ...rate, rbiReferenceRateInrPerUnit: "0.55" });
  assert.equal(jpy.status, "rate"); assert.equal(jpy.commissionAmount, "50000"); assert.equal(jpy.storableWithoutMigration, true);
  // OMR: 3 decimals; a 3rd-decimal amount is flagged as not storable without a migration
  const omr: any = buildDefaultCommissionPreview({ quantity: "1", unit: "MT", agreedPrice: "100000.123", currency: "OMR" }, { ...rate, rbiReferenceRateInrPerUnit: "217" });
  assert.equal(omr.status, "rate"); assert.equal(omr.commissionAmount, "1000.001"); assert.equal(omr.storableWithoutMigration, false);
  const unknown: any = buildDefaultCommissionPreview({ ...usd, currency: "XXX" }, rate);
  assert.equal(unknown.status, "manual_review"); assert.equal(unknown.reason, "unsupported_commission_currency");
  const inr: any = buildDefaultCommissionPreview({ quantity: "10", unit: "MT", agreedPrice: "100000", currency: "INR" }, { invoiceDate: "2026-10-20" });
  assert.equal(inr.ratePercent, "2"); assert.equal(inr.commissionAmount, "20000.00");
  assert.deepEqual(buildDefaultCommissionPreview({ ...usd, quantity: "abc" }, rate), { error: "deal_value_unavailable" });
});

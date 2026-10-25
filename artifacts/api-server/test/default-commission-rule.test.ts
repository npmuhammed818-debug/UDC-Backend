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
test("agent pool is half of the commission actually received, rounded once half up to cents", () => {
  assert.equal(agentPoolFromReceived("1000.00", "USD"), "500.00");
  assert.equal(agentPoolFromReceived("0.03", "INR"), "0.02");
  assert.throws(() => agentPoolFromReceived("0", "USD"));
  assert.throws(() => agentPoolFromReceived("1000", "JPY"), /manual_review_currency_precision/);
  assert.throws(() => agentPoolFromReceived("10.005", "USD"), /manual_review_received_amount_precision/);
  assert.equal(agentPoolFromReceived("10", "USD"), "5.00");
  assert.equal(agentPoolFromReceived("10.01", "USD"), "5.01");
});

test("preview builder: estimate vs actual value, manual review, and no money for unconfirmed currencies", () => {
  const usd = { quantity: "100", unit: "MT", agreedPrice: "300", currency: "usd" }; // estimate 30,000 USD
  const rate = { invoiceDate: "2026-10-20", rbiReferenceRateInrPerUnit: "83.5", rbiReferenceRateDate: "2026-10-20" };
  const est: any = buildDefaultCommissionPreview(usd, rate);
  assert.equal(est.status, "rate"); assert.equal(est.ratePercent, "1"); assert.equal(est.commissionAmount, "300.00");
  assert.equal(est.requiresInvoiceConfirmation, true); assert.equal(est.valueBasis, "estimate_quantity_x_agreed_price"); assert.equal(est.commissionCurrency, "USD");
  // the stated actual invoice value wins over quantity x price (here below the threshold -> 2% of 29,000)
  const act: any = buildDefaultCommissionPreview(usd, { ...rate, actualInvoiceValue: "29000" });
  assert.equal(act.ratePercent, "2"); assert.equal(act.commissionAmount, "580.00"); assert.equal(act.requiresInvoiceConfirmation, false); assert.equal(act.valueBasis, "admin_supplied_actual_invoice_value");
  // no RBI rate for a foreign invoice -> manual review, no amount
  const mr: any = buildDefaultCommissionPreview(usd, { invoiceDate: "2026-10-20" });
  assert.equal(mr.status, "manual_review"); assert.equal(mr.reason, "rbi_rate_missing"); assert.equal("commissionAmount" in mr, false);
  // currency outside the confirmed 2-decimal list -> rate only, no money value
  const jpy: any = buildDefaultCommissionPreview({ ...usd, currency: "JPY" }, rate);
  assert.equal(jpy.status, "rate_only"); assert.equal(jpy.commissionAmount, null);
  // INR needs no rate
  const inr: any = buildDefaultCommissionPreview({ quantity: "10", unit: "MT", agreedPrice: "100000", currency: "INR" }, { invoiceDate: "2026-10-20" });
  assert.equal(inr.ratePercent, "2"); assert.equal(inr.commissionAmount, "20000.00");
  // unusable deal value
  assert.deepEqual(buildDefaultCommissionPreview({ ...usd, quantity: "abc" }, rate), { error: "deal_value_unavailable" });
});

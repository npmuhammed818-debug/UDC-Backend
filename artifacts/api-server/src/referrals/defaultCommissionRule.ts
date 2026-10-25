import { calculateCommissionAmount, CommissionCalculationError } from "./commissionAmount.ts";
import { minorUnitDigits, commissionAmountFitsStorage } from "./currencyPrecision.ts";
// UDC default seller commission rule (owner decision, WhatsApp Oct 25: RBI reference rate on the
// invoice date converts a foreign invoice to INR only to choose the percentage). Published Terms 9.1:
// 1% of invoice value at INR 25 lakh or above, 2% below; seller pays. This module only SELECTS the
// percentage and computes amounts. It never fetches rates, converts money for payment, or assumes a
// settlement currency. Missing or mismatched inputs return manual_review, never a guess.
// Per-deal written fee schedules (Terms 9.2) override this default and are handled by the caller.

export const INR_THRESHOLD_PAISE = 2_500_000n * 100n; // INR 25 lakh

export type DefaultRuleInput = {
  invoiceValue: string; // decimal in invoiceCurrency
  invoiceCurrency: string; // ISO 4217, explicit
  invoiceDate: string; // YYYY-MM-DD
  rbiReferenceRateInrPerUnit?: string; // decimal, supplied by an admin from the RBI reference rate
  rbiReferenceRateDate?: string; // YYYY-MM-DD; must equal invoiceDate
};

export type DefaultRuleResult =
  | { status: "rate"; ratePercent: "1" | "2"; invoiceValueInr: string; basis: "inr_invoice" | "rbi_reference_rate_on_invoice_date" }
  | { status: "manual_review"; reason: "invalid_invoice_value" | "invalid_currency" | "invalid_invoice_date" | "rbi_rate_missing" | "rbi_rate_invalid" | "rbi_rate_date_not_invoice_date" };

function dec(text: string) {
  if (!/^\d+(?:\.\d{1,8})?$/.test(text) || text.length > 30) return null;
  const [w, f = ""] = text.split(".");
  return { n: BigInt(w + f), d: 10n ** BigInt(f.length) };
}

export function selectDefaultSellerRate(input: DefaultRuleInput): DefaultRuleResult {
  if (!/^[A-Z]{3}$/.test(input.invoiceCurrency)) return { status: "manual_review", reason: "invalid_currency" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate) || Number.isNaN(Date.parse(input.invoiceDate))) return { status: "manual_review", reason: "invalid_invoice_date" };
  const value = dec(input.invoiceValue);
  if (!value || value.n <= 0n) return { status: "manual_review", reason: "invalid_invoice_value" };
  let numerator = value.n, denominator = value.d, basis: "inr_invoice" | "rbi_reference_rate_on_invoice_date" = "inr_invoice";
  if (input.invoiceCurrency !== "INR") {
    if (!input.rbiReferenceRateInrPerUnit || !input.rbiReferenceRateDate) return { status: "manual_review", reason: "rbi_rate_missing" };
    const rate = dec(input.rbiReferenceRateInrPerUnit);
    if (!rate || rate.n <= 0n) return { status: "manual_review", reason: "rbi_rate_invalid" };
    if (input.rbiReferenceRateDate !== input.invoiceDate) return { status: "manual_review", reason: "rbi_rate_date_not_invoice_date" };
    numerator *= rate.n; denominator *= rate.d; basis = "rbi_reference_rate_on_invoice_date";
  }
  // compare value*100 paise against threshold exactly
  const atOrAbove = numerator * 100n >= INR_THRESHOLD_PAISE * denominator;
  const paise = (numerator * 100n * 2n + denominator) / (denominator * 2n); // for display only, half up
  const invoiceValueInr = `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
  return { status: "rate", ratePercent: atOrAbove ? "1" : "2", invoiceValueInr, basis };
}

/**
 * Agents collectively receive half of the commission UDC actually received (Agreement 3.2).
 * Uses the currency's own minor units (JPY 0, OMR 3, most others 2). The received amount must already be
 * expressed in those units (excess precision -> error, never silently rounded); it is halved once and an
 * odd minor unit is rounded half up. Unsupported currencies are rejected.
 */
export function agentPoolFromReceived(receivedCommission: string, currency: string): string {
  const digits = minorUnitDigits(currency);
  if (digits === null) throw new Error("unsupported_commission_currency");
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${Math.max(digits, 1)}})?$`).test(receivedCommission) || (digits === 0 && receivedCommission.includes("."))) throw new Error("received_amount_precision_exceeds_currency");
  const [w, f = ""] = receivedCommission.split(".");
  const units = BigInt(w + f.padEnd(digits, "0"));
  if (units <= 0n) throw new Error("invalid_received_commission");
  const half = (units + 1n) / 2n;
  const scale = 10n ** BigInt(digits);
  return digits === 0 ? `${half}` : `${half / scale}.${String(half % scale).padStart(digits, "0")}`;
}

export type PreviewDeal = { quantity: string; unit: string; agreedPrice: string; currency: string };
export type PreviewInput = { invoiceDate: string; rbiReferenceRateInrPerUnit?: string; rbiReferenceRateDate?: string; actualInvoiceValue?: string };

/** Pure builder behind POST /admin/deals/:dealId/default-commission-preview. Reads nothing, writes nothing. */
export function buildDefaultCommissionPreview(deal: PreviewDeal, input: PreviewInput): Record<string, unknown> {
  const currency = deal.currency.toUpperCase();
  if (minorUnitDigits(currency) === null) return { status: "manual_review", reason: "unsupported_commission_currency", note: "This currency is not on the supported list; no rate or amount computed." };
  const estimated = input.actualInvoiceValue === undefined;
  const valueBasis = estimated ? "estimate_quantity_x_agreed_price" : "admin_supplied_actual_invoice_value";
  let invoiceValue: string;
  try {
    invoiceValue = input.actualInvoiceValue ?? calculateCommissionAmount({ method: "percentage", quantity: deal.quantity, unit: deal.unit, agreedPrice: deal.agreedPrice, rate: "100", currency });
  } catch (error) {
    if (error instanceof CommissionCalculationError) return { error: "deal_value_unavailable" };
    throw error;
  }
  const outcome = selectDefaultSellerRate({ invoiceValue, invoiceCurrency: currency, invoiceDate: input.invoiceDate, rbiReferenceRateInrPerUnit: input.rbiReferenceRateInrPerUnit, rbiReferenceRateDate: input.rbiReferenceRateDate });
  if (outcome.status === "manual_review") return { status: "manual_review", reason: outcome.reason, valueBasis, note: "No rate selected. Supply the RBI reference rate dated the invoice date, or record a written fee schedule." };
  const amount = calculateCommissionAmount({ method: "percentage", quantity: "1", unit: "invoice", agreedPrice: invoiceValue, rate: outcome.ratePercent, currency });
  return { status: "rate", ratePercent: outcome.ratePercent, payer: "seller", basis: outcome.basis, invoiceValueInr: outcome.invoiceValueInr, commissionAmount: amount, commissionCurrency: currency, valueBasis, requiresInvoiceConfirmation: estimated, roundingNote: `Rounded once, half up, to ${minorUnitDigits(currency)} decimal(s) for ${currency}.`, storableWithoutMigration: commissionAmountFitsStorage(amount), note: (estimated ? "ESTIMATE from quantity x agreed price; freight, fees, discounts or a different price basis are not reflected. Supply actualInvoiceValue before relying on the rate. " : "") + "Preview only. Nothing recorded. Record via POST /admin/commissions with the percentage method after review." };
}

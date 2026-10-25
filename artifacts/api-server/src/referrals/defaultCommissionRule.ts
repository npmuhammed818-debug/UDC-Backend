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

// ISO 4217 currencies with exactly 2 minor-unit digits. Cent rounding is only applied for these;
// any other currency (0, 3 or 4 digits, unknown) needs manual review rather than a silent rounding policy.
export const TWO_DECIMAL_CURRENCIES = new Set(["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "CHF"]);

/**
 * Agents collectively receive half of the commission UDC actually received (Agreement 3.2).
 * The received amount must already be quantized to 2 decimals in a known 2-decimal currency
 * (excess precision or another currency -> manual review). Halving happens once; an odd cent is rounded half up.
 */
export function agentPoolFromReceived(receivedCommission: string, currency: string): string {
  if (!TWO_DECIMAL_CURRENCIES.has(currency)) throw new Error("manual_review_currency_precision");
  if (!/^\d+(?:\.\d{1,2})?$/.test(receivedCommission)) throw new Error("manual_review_received_amount_precision");
  const [w, f = ""] = receivedCommission.split(".");
  const cents = BigInt(w + f.padEnd(2, "0"));
  if (cents <= 0n) throw new Error("invalid_received_commission");
  const half = (cents + 1n) / 2n;
  return `${half / 100n}.${String(half % 100n).padStart(2, "0")}`;
}

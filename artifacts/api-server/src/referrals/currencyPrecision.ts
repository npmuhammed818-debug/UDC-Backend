// ISO 4217 minor-unit digits for currencies UDC deals may use. Unknown codes are NOT guessed:
// callers must reject them (validation), never default to 2 digits.
const ZERO = ["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF", "XPF", "PYG", "RWF", "DJF", "GNF", "KMF", "VUV"];
const THREE = ["OMR", "BHD", "KWD", "JOD", "TND", "LYD", "IQD"];
const TWO = [
  "USD", "EUR", "GBP", "INR", "AED", "SAR", "QAR", "SGD", "AUD", "CAD", "CHF", "CNY", "HKD", "NZD", "ZAR", "THB",
  "MYR", "IDR", "PHP", "PKR", "BDT", "LKR", "NPR", "EGP", "TRY", "RUB", "BRL", "MXN", "ARS", "COP", "PEN", "SEK",
  "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "ILS", "KES", "NGN", "GHS", "TZS", "MAD", "DZD", "ETB", "KZT",
  "UAH", "TWD", "MMK", "KHR", "LAK", "MUR",
];
const DIGITS = new Map<string, number>([...ZERO.map((c) => [c, 0] as const), ...THREE.map((c) => [c, 3] as const), ...TWO.map((c) => [c, 2] as const)]);

/** Minor-unit digits for a currency, or null when the code is not on the supported list. */
export function minorUnitDigits(currency: string): number | null {
  const digits = DIGITS.get(currency.toUpperCase());
  return digits === undefined ? null : digits;
}

/** The commissions table stores amounts as numeric(18,2). Currencies needing more digits need an approved migration. */
export const COMMISSION_STORAGE_DIGITS = 2;

/** True when the amount string can be stored in numeric(18,2) without changing its value. */
export function commissionAmountFitsStorage(amount: string): boolean {
  const fraction = amount.split(".")[1] ?? "";
  return fraction.slice(COMMISSION_STORAGE_DIGITS).replace(/0/g, "") === "";
}

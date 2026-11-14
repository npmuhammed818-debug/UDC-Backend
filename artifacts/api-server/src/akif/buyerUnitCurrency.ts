/** Keeps the unit and currency a buyer actually stated (never silently MT / USD). Pure, so it is testable without a database. */
export function takeBuyerUnitCurrency(args: Record<string, unknown>, fields: Record<string, string>): { rest: Record<string, unknown>; rejected: string[] } {
  const { unit, currency, ...rest } = args;
  const rejected: string[] = [];
  if (typeof unit === "string" && unit.trim()) {
    if (unit.trim().length <= 24) { fields.unit = unit.trim(); delete fields.__bad_unit; }
    else { rejected.push("unit is too long"); fields.__bad_unit = "1"; }
  }
  if (typeof currency === "string" && currency.trim()) {
    if (/^[A-Za-z]{3}$/.test(currency.trim())) { fields.currency = currency.trim().toUpperCase(); delete fields.__bad_currency; }
    else { rejected.push("currency must be a 3 letter code such as EUR"); fields.__bad_currency = "1"; }
  }
  return { rest, rejected };
}

/** A unit or currency the buyer stated but we could not read stays unresolved: submit is blocked until they clarify (never silently MT or USD). */
export function buyerUnresolved(fields: Record<string, string | undefined>): string | null {
  const parts: string[] = [];
  if (fields.__bad_currency) parts.push("which three letter currency code to use, for example EUR");
  if (fields.__bad_unit) parts.push("which unit the quantity is in, for example kg or MT");
  return parts.length ? `Cannot submit yet. The customer stated a value that could not be read, so ask them ${parts.join(" and ")}. Do not assume MT or USD.` : null;
}

/** Unit and currency a buyer requirement is priced in. Defaults only when the buyer stated nothing. */
export function buyerBasis(data: Record<string, string | undefined>): { unit: string; currency: string } {
  return { unit: data.unit?.trim() || "MT", currency: data.currency?.trim().toUpperCase() || "USD" };
}

/** The exact object handed to buyerIntakeSchema by both the scripted form and the brain tool. */
export function buyerRequirementPayload(phone: string, fullName: string | null | undefined, f: Record<string, string | undefined>, optional: (v: string | undefined) => string | undefined = (v) => (v && v.trim() ? v : undefined)) {
  const { unit, currency } = buyerBasis(f);
  return {
    phone, fullName: fullName || "WhatsApp buyer", product: f.product, quantity: f.quantity, unit, currency,
    destination: f.destination, incoterm: f.incoterm, specification: optional(f.specification), targetPrice: optional(f.target_price),
    deliveryTime: optional(f.delivery_time), paymentTerms: optional(f.payment_terms),
  };
}

/** Question wording that follows the buyer's own unit and currency (MT and USD only when nothing was stated). */
export function buyerQuantityLabel(data: Record<string, string | undefined>): string {
  const u = data.unit?.trim();
  return u && u.toUpperCase() !== "MT" ? `How much do you need, in ${u}?` : "How many metric tonnes (MT) do you need?";
}
export function buyerPriceLabel(data: Record<string, string | undefined>): string {
  const { unit, currency } = buyerBasis(data);
  return `What is your target price in ${currency} per ${unit}?`;
}

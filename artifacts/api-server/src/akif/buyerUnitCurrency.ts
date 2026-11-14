/** Keeps the unit and currency a buyer actually stated (never silently MT / USD). Pure, so it is testable without a database. */
export function takeBuyerUnitCurrency(args: Record<string, unknown>, fields: Record<string, string>): { rest: Record<string, unknown>; rejected: string[] } {
  const { unit, currency, ...rest } = args;
  const rejected: string[] = [];
  if (typeof unit === "string" && unit.trim()) {
    if (unit.trim().length <= 24) fields.unit = unit.trim(); else rejected.push("unit is too long");
  }
  if (typeof currency === "string" && currency.trim()) {
    if (/^[A-Za-z]{3}$/.test(currency.trim())) fields.currency = currency.trim().toUpperCase(); else rejected.push("currency must be a 3 letter code such as EUR");
  }
  return { rest, rejected };
}

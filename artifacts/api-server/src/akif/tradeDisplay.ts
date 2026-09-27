export function formatTradeNumber(value: string | number, maximumFractionDigits = 6) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    useGrouping: true,
  }).format(numeric);
}

export function formatTradeQuantity(value: string | number) {
  return formatTradeNumber(value, 6);
}

export function formatTradePrice(value: string | number) {
  return formatTradeNumber(value, 2);
}

export function formatTradeMoney(currency: string, value: string | number) {
  const amount = formatTradePrice(value);
  const code = currency.trim().toUpperCase();

  if (code === "USD") return `$${amount}`;
  if (code === "EUR") return `€${amount}`;
  if (code === "GBP") return `£${amount}`;
  return `${code} ${amount}`;
}

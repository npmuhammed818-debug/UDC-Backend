// Stored commercial values are decimal strings. Never round through Number or
// limit money to two decimals: per-unit prices can have meaningful fractions.
export function formatTradeNumber(value: string | number) {
  const text=String(value);
  if(!/^\d{1,30}(?:\.\d{1,12})?$/.test(text))return "unavailable";
  const [whole,fraction=""]=text.split(".");
  const digits=whole!.replace(/^0+(?=\d)/,"");
  const tail=fraction.replace(/0+$/,"");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g,",")+(tail?"."+tail:"");
}
export function formatTradeQuantity(value: string | number) { return formatTradeNumber(value); }
export function formatTradeMoney(currency: string, value: string | number) {
  const amount=formatTradeNumber(value);
  const code=currency.trim().toUpperCase();
  return code === "USD" ? `$${amount}` : `${code} ${amount}`;
}


export function formatTradePrice(value:string|number){return formatTradeNumber(value);}

/** Only an entire, unambiguous price/port statement; never a question or instruction. */
export function explicitBuyerPriceFollowup(message: string) {
  if (/\b(?:not|instead|if|maybe|please|thanks|tomorrow|today|why|what|would|could|should)\b|\?/i.test(message)) return null;
  const number = '(\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.(\\d+))?';
  const match = new RegExp(`^(?:(?:USD|\\$)\\s*${number}|${number}\\s*USD)(?:\\s*(?:per|/)\\s*(?:MT|metric tons?|tonnes?))?(?:\\s*[,;]?\\s*(CIF|DAP|DDP)\\s+([A-Za-z][A-Za-z .'-]{1,80}))?[.!]?\\s*$`, 'i').exec(message.trim());
  if (!match) return null;
  const whole = match[1] ?? match[3], fraction = match[2] ?? match[4];
  const targetPrice = Number(whole.replaceAll(',', '') + (fraction ? '.' + fraction : ''));
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) return null;
  return { targetPrice, currency: 'USD', ...(match[5] ? { incoterm: match[5].toUpperCase(), destination: match[6].trim().replace(/[.!]+$/, '') } : {}) };
}

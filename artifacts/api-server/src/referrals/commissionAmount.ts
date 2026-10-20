export class CommissionCalculationError extends Error {}

export type CommissionMethod = 'percentage' | 'fixed_per_mt' | 'fixed_amount';

function decimal(value: string | number) {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,6})?$/.test(text) || text.length > 28) throw new CommissionCalculationError('invalid_commission_number');
  const [whole, fraction = ''] = text.split('.');
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}

/** Exact decimal arithmetic; round the final amount once, half up, to cents. */
export function calculateCommissionAmount(input: {
  method: CommissionMethod; quantity: string; unit: string; agreedPrice: string;
  rate?: string | number; amount?: string | number;
}) {
  let numerator: bigint, denominator: bigint;
  if (input.method === 'fixed_amount') {
    if (input.amount === undefined) throw new CommissionCalculationError('commission_amount_required');
    const amount = decimal(input.amount); numerator = amount.numerator; denominator = amount.denominator;
  } else {
    if (input.rate === undefined) throw new CommissionCalculationError('commission_rate_required');
    const rate = decimal(input.rate), quantity = decimal(input.quantity);
    if (rate.numerator * 10000n > 99999999n * rate.denominator || String(input.rate).split('.')[1]?.length > 4) throw new CommissionCalculationError('commission_rate_out_of_range');
    if (quantity.numerator <= 0n) throw new CommissionCalculationError('invalid_commission_quantity');
    numerator = quantity.numerator * rate.numerator;
    denominator = quantity.denominator * rate.denominator;
    if (input.method === 'percentage') {
      if (rate.numerator > 100n * rate.denominator) throw new CommissionCalculationError('invalid_commission_percentage');
      const price = decimal(input.agreedPrice);
      if (price.numerator <= 0n) throw new CommissionCalculationError('invalid_commission_price');
      numerator *= price.numerator; denominator *= price.denominator * 100n;
    } else if (!/^(?:mt|metric tons?|metric tonnes?)$/i.test(input.unit.trim())) {
      throw new CommissionCalculationError('commission_requires_mt_quantity');
    }
  }
  const cents = (numerator * 100n + denominator / 2n) / denominator;
  if (cents <= 0n || cents > 999999999999999999n) throw new CommissionCalculationError('commission_amount_out_of_range');
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

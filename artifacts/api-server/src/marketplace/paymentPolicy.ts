// Default recommendation only. A different proposal requires exact buyer agreement before a deal opens.
export const udcPaymentTerms = "DLC issued directly to the seller; payment after SGS inspection at destination";

export function hasConflictingPaymentTerms(value: string | undefined) {
  return Boolean(value?.trim() && value.trim() !== udcPaymentTerms);
}

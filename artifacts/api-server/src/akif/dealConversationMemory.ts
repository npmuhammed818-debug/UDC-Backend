type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function conversationSafeDealMemory(snapshot: unknown) {
  const source = asRecord(snapshot);
  if (!source) return null;

  const extractionSummaries = safeArray(source.documentExtractions)
    .map(asRecord)
    .filter((item): item is UnknownRecord => Boolean(item))
    .filter((item) => item.status === "completed" || item.status === "needs_review")
    .map((item) => ({
      documentId: item.documentId ?? null,
      status: item.status,
      structuredData: item.structuredData ?? null,
      confidence: item.confidence ?? null,
    }));

  const documents = safeArray(source.documents)
    .map(asRecord)
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((item) => ({
      id: item.id ?? null,
      documentType: item.documentType ?? null,
      status: item.status ?? null,
      createdAt: item.createdAt ?? null,
    }));

  return {
    deal: source.deal ?? null,
    product: source.product ?? null,
    buyerRequest: source.buyerRequest ?? null,
    sellerListing: source.sellerListing ?? null,
    documents,
    documentExtractions: extractionSummaries,
    financials: source.financials ?? [],
    inspections: source.inspections ?? [],
    shipments: source.shipments ?? [],
    commissions: source.commissions ?? [],
  };
}

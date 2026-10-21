type UnknownRecord = Record<string, unknown>;

export function recentDealConversation<T extends { id: string; intent: string }>(history: T[], replyContextKind?: string): T[] {
  const eligible = history.filter(event => event.intent !== "new_trade_intake");
  const recent = eligible.slice(-24);
  const quotedId = replyContextKind?.match(/^mediated_[a-z_]+:([0-9a-f-]{36})$/i)?.[1];
  const quoted = quotedId ? eligible.find(event => event.id === quotedId) : undefined;
  // A reply to an older delivered offer must retain that exact offer, rather than
  // borrowing terms from a more recent conversation. Keep the total bounded.
  return quoted && !recent.some(event => event.id === quoted.id)
    ? [quoted, ...recent.slice(-23)] : recent;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function conversationSafeDealMemory(snapshot: unknown, viewer?: { userId: string; documentIds: string[]; counterpartyUserId: string; counterpartyDocumentIds: string[] }) {
  const source = asRecord(snapshot);
  if (!source) return null;

  const visibleDocuments = safeArray(source.documents).map(asRecord).filter((item): item is UnknownRecord => Boolean(item))
    .filter(item => !viewer || item.uploadedBy === viewer.userId || (item.status === "approved" && viewer.documentIds.includes(String(item.id))));
  const sharedFactIds = new Set(visibleDocuments.filter(item => !viewer || (item.status === "approved" && (item.uploadedBy === viewer.counterpartyUserId || viewer.counterpartyDocumentIds.includes(String(item.id))))).map(item => item.id));
  const pick = (value: unknown, keys: string[]) => {
    const record = asRecord(value); return record ? Object.fromEntries(keys.filter(key => key in record).map(key => [key, record[key]])) : null;
  };
  const publicRows = (value: unknown, keys: string[]) => safeArray(value).map(item => pick(item, keys));

  const extractionSummaries = safeArray(source.documentExtractions)
    .map(asRecord)
    .filter((item): item is UnknownRecord => Boolean(item))
    .filter((item) => (!viewer || sharedFactIds.has(item.documentId)) && (item.status === "completed" || item.status === "needs_review"))
    .map((item) => ({
      documentId: item.documentId ?? null,
      status: item.status,
      structuredData: item.structuredData ?? null,
      confidence: item.confidence ?? null,
    }));

  const documents = visibleDocuments
    .map((item) => ({
      id: item.id ?? null,
      documentType: item.documentType ?? null,
      status: item.status ?? null,
      createdAt: item.createdAt ?? null,
    }));

  const recorded = safeArray(source.history).map(asRecord).find(event=>event?.action==='deal_created');
  const agreed = asRecord(asRecord(recorded?.metadata)?.agreedTerms);
  return {
    agreedTerms: agreed ? pick(agreed,['paymentTerms','inspectionTerms']) : null,
    deal: viewer ? pick(source.deal, ["dealNumber", "status", "quantity", "unit", "agreedPrice", "currency", "incoterm", "destination"]) : source.deal ?? null,
    product: viewer ? pick(source.product, ["name", "category", "description"]) : source.product ?? null,
    buyerRequest: viewer ? null : source.buyerRequest ?? null,
    sellerListing: viewer ? null : source.sellerListing ?? null,
    documents,
    documentExtractions: extractionSummaries,
    financials: viewer ? publicRows(source.financials, ["instrumentType", "status"]) : source.financials ?? [],
    inspections: viewer ? publicRows(source.inspections, ["inspectorName", "status", "scheduledAt", "resultSummary"]) : source.inspections ?? [],
    shipments: viewer ? publicRows(source.shipments, ["carrier", "trackingNumber", "status", "origin", "destination", "estimatedArrival", "notes"]) : source.shipments ?? [],
    commissions: viewer ? [] : source.commissions ?? [],
  };
}

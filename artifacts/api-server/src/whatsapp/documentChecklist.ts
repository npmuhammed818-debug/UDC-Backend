// Required verification documents per role for the Upload documents action, with
// per-document status. Bank proof is not collected here; UDC asks for it inside a
// deal, before the SPA. Agents upload nothing - their verified profile is enough.
export type DocumentStatusRow = { documentType: string; status: string };
export type RequiredDocument = { key: string; label: string };

const BUYER_DOCUMENTS: RequiredDocument[] = [
  { key: 'company_registration', label: 'Company registration or trade licence' },
  { key: 'tax_id', label: "Tax ID (GST, VAT or your country's equal)" },
  { key: 'import_licence', label: 'Import licence (only if your country requires one)' },
];

const SELLER_DOCUMENTS: RequiredDocument[] = [
  ...BUYER_DOCUMENTS.slice(0, 2),
  { key: 'export_licence', label: 'Export licence or exporter ID (if your country has one)' },
  { key: 'product_licence', label: 'Product licences (if your product needs them)' },
  { key: 'past_exports', label: 'Past export invoices or factory photos' },
];

export function requiredDocuments(role: string): RequiredDocument[] {
  if (role === 'buyer') return BUYER_DOCUMENTS;
  if (role === 'seller') return SELLER_DOCUMENTS;
  return [];
}

function documentStatus(docs: DocumentStatusRow[], key: string): string {
  const doc = [...docs].reverse().find((d) => d.documentType === key);
  if (!doc) return 'not uploaded yet';
  if (doc.status === 'approved') return 'verified';
  if (doc.status === 'rejected') return 'sent back by UDC - please upload it again';
  return 'uploaded, waiting for UDC review';
}

export function documentsStatusText(role: string, docs: DocumentStatusRow[]): string {
  const list = requiredDocuments(role);
  const lines = list.map((d, i) => `${i + 1}. ${d.label} - ${documentStatus(docs, d.key)}`);
  const verified = list.filter((d) => documentStatus(docs, d.key) === 'verified').length;
  const head = verified === list.length && list.length > 0
    ? 'All your documents are verified.'
    : `Your documents: ${verified} of ${list.length} verified.`;
  return `${head}\n${lines.join('\n')}`;
}

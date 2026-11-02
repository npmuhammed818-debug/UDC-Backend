import { useQuery, useQueryClient } from '@tanstack/react-query';

export type AnyRecord = Record<string, any>;

export async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json() as Promise<T>;
}

export function initials(name?: string | null) {
  return (name || 'UDC').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function fmtStatus(value?: string) {
  return (value || 'pending').replaceAll('_', ' ');
}

export function timeAgo(value?: string) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1d ago' : `${days}d ago`;
}

export type QueueItem = {
  key: string;
  chip: 'PERSON' | 'COMPANY' | 'BUYER NEED' | 'SELLER OFFER' | 'DOC';
  chipClass: string;
  title: string;
  detail: string;
  fileUrl?: string;
  time?: string;
  approve: () => Promise<void>;
  decline?: (note: string) => Promise<void>;
  declineNeedsNote: boolean;
  detailsHref: string;
};

export function pillFor(status?: string) {
  if (['completed', 'delivered', 'verified', 'confirmed', 'paid'].includes(status || '')) return 'av2-pill av2-p-ok';
  if (['cancelled', 'rejected', 'disputed'].includes(status || '')) return 'av2-pill av2-p-warn';
  return 'av2-pill av2-p-run';
}

export function useAdminV2Data() {
  const qc = useQueryClient();

  const users = useQuery({ queryKey: ['v2-users'], queryFn: () => loadJson<{ users: AnyRecord[] }>('/api/admin/users/pending-verification') });
  const companies = useQuery({ queryKey: ['v2-companies'], queryFn: () => loadJson<{ companies: AnyRecord[] }>('/api/admin/companies/pending-verification') });
  const companyDocs = useQuery({ queryKey: ['v2-company-docs'], queryFn: () => loadJson<{ documents: AnyRecord[] }>('/api/admin/company-verification-documents') });
  const dealDocs = useQuery({ queryKey: ['v2-deal-docs'], queryFn: () => loadJson<{ documents: AnyRecord[] }>('/api/admin/documents') });
  const buyers = useQuery({ queryKey: ['v2-buyers'], queryFn: () => loadJson<{ requirements: AnyRecord[] }>('/api/admin/buyer-requests') });
  const sellers = useQuery({ queryKey: ['v2-sellers'], queryFn: () => loadJson<{ offers: AnyRecord[] }>('/api/admin/seller-offers') });
  const allUsers = useQuery({ queryKey: ['v2-all-users'], queryFn: () => loadJson<{ users: AnyRecord[] }>('/api/admin/users') });
  const allDeals = useQuery({ queryKey: ['v2-all-deals'], queryFn: () => loadJson<{ deals: AnyRecord[] }>('/api/admin/deals') });
  const audit = useQuery({ queryKey: ['v2-audit'], queryFn: () => loadJson<{ logs: AnyRecord[] }>('/api/admin/audit-log?limit=6&offset=0') });
  const analytics = useQuery({ queryKey: ['v2-analytics'], queryFn: () => loadJson<{ commissionPerformance: AnyRecord[]; stages: AnyRecord[]; completedValues: AnyRecord[]; products: AnyRecord[]; buyerCountries: AnyRecord[]; sellerCountries: AnyRecord[] }>('/api/admin/analytics') });

  const patch = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(path, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      if ((result as AnyRecord).error === 'approved_company_document_required') throw new Error('Approve at least one company evidence document before verifying this company.');
      throw new Error('The review could not be saved. Check the record and try again.');
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['v2-users'] }), qc.invalidateQueries({ queryKey: ['v2-companies'] }),
      qc.invalidateQueries({ queryKey: ['v2-company-docs'] }), qc.invalidateQueries({ queryKey: ['v2-deal-docs'] }),
      qc.invalidateQueries({ queryKey: ['v2-buyers'] }), qc.invalidateQueries({ queryKey: ['v2-sellers'] }),
      qc.invalidateQueries({ queryKey: ['v2-all-users'] }), qc.invalidateQueries({ queryKey: ['v2-all-deals'] }),
      qc.invalidateQueries({ queryKey: ['v2-audit'] }), qc.invalidateQueries({ queryKey: ['v2-analytics'] }),
    ]);
  };

  const queue: QueueItem[] = [];
  for (const item of users.data?.users ?? []) queue.push({
    key: `user-${item.id}`, chip: 'PERSON', chipClass: '', title: item.fullName || 'Unnamed person',
    detail: `${item.email || 'no email'} · ${item.role || 'participant'}`,
    time: timeAgo(item.createdAt), declineNeedsNote: false, detailsHref: `/admin/v2/people#user-${item.id}`,
    approve: () => patch(`/api/admin/users/${item.id}/verification`, { status: 'verified' }),
    decline: () => patch(`/api/admin/users/${item.id}/verification`, { status: 'rejected' }),
  });
  for (const item of companies.data?.companies ?? []) queue.push({
    key: `company-${item.id}`, chip: 'COMPANY', chipClass: 'co', title: item.companyName || 'Unnamed company',
    detail: [item.ownerName, item.ownerRole, item.country].filter(Boolean).join(' · ') || 'Registration details not provided',
    time: timeAgo(item.createdAt), declineNeedsNote: false, detailsHref: `/admin/v2/companies#company-${item.id}`,
    approve: () => patch(`/api/admin/companies/${item.id}/verification`, { verification_status: 'verified' }),
    decline: () => patch(`/api/admin/companies/${item.id}/verification`, { verification_status: 'rejected' }),
  });
  for (const item of buyers.data?.requirements ?? []) queue.push({
    key: `buyer-${item.id}`, chip: 'BUYER NEED', chipClass: 'trade', title: `${item.quantity ?? ''} ${item.unit || ''} · ${item.destination || 'destination open'}`,
    detail: `Target ${item.currency || ''} ${item.targetPrice || 'not stated'}`,
    time: timeAgo(item.createdAt), declineNeedsNote: false, detailsHref: `/admin/v2/trades#buyer-${item.id}`,
    approve: () => patch(`/api/admin/buyer-requests/${item.id}/status`, { status: 'approved' }),
    decline: () => patch(`/api/admin/buyer-requests/${item.id}/status`, { status: 'rejected' }),
  });
  for (const item of sellers.data?.offers ?? []) queue.push({
    key: `seller-${item.id}`, chip: 'SELLER OFFER', chipClass: 'trade', title: `${item.quantity ?? ''} ${item.unit || ''} · ${item.originCountry || 'origin pending'}`,
    detail: `${item.currency || ''} ${item.price ?? ''}/${item.unit || ''}`,
    time: timeAgo(item.createdAt), declineNeedsNote: false, detailsHref: `/admin/v2/trades#seller-${item.id}`,
    approve: () => patch(`/api/admin/seller-offers/${item.id}/status`, { status: 'approved' }),
    decline: () => patch(`/api/admin/seller-offers/${item.id}/status`, { status: 'rejected' }),
  });
  for (const item of (companyDocs.data?.documents ?? []).filter((doc) => doc.status === 'pending')) queue.push({
    key: `cdoc-${item.id}`, chip: 'DOC', chipClass: 'doc', title: `${fmtStatus(item.documentType)} · ${item.companyName || 'company'}`,
    detail: [item.ownerName, item.ownerEmail].filter(Boolean).join(' · ') || 'Company evidence',
    fileUrl: item.fileUrl, time: timeAgo(item.createdAt), declineNeedsNote: true, detailsHref: `/admin/v2/documents#cdoc-${item.id}`,
    approve: () => patch(`/api/admin/company-verification-documents/${item.id}/status`, { status: 'approved' }),
    decline: (note) => patch(`/api/admin/company-verification-documents/${item.id}/status`, { status: 'rejected', reviewNote: note }),
  });
  for (const item of (dealDocs.data?.documents ?? []).filter((doc) => doc.status === 'pending')) queue.push({
    key: `ddoc-${item.id}`, chip: 'DOC', chipClass: 'doc', title: fmtStatus(item.documentType),
    detail: `Deal ${item.dealId || ''}`, fileUrl: item.fileUrl, time: timeAgo(item.createdAt),
    declineNeedsNote: true, detailsHref: `/admin/v2/documents#ddoc-${item.id}`,
    approve: () => patch(`/api/admin/documents/${item.id}/status`, { status: 'approved' }),
    decline: (note) => patch(`/api/admin/documents/${item.id}/status`, { status: 'rejected', reviewNote: note }),
  });

  const queuesLoading = [users, companies, companyDocs, dealDocs, buyers, sellers].some((q) => q.isLoading);
  const queuesFailed = [users, companies, companyDocs, dealDocs, buyers, sellers].some((q) => q.isError);

  const deals = allDeals.data?.deals ?? [];
  const running = deals.filter((deal) => !['completed', 'cancelled'].includes(String(deal.status)));

  return {
    users, companies, companyDocs, dealDocs, buyers, sellers, allUsers, allDeals, audit, analytics,
    queue, queuesLoading, queuesFailed, pendingCount: queue.length, deals, running, refreshAll,
  };
}

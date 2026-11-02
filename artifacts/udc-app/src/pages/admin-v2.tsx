import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { useGetCurrentUser, useLogoutUser } from '@workspace/api-client-react';
import '../admin-v2.css';

type AnyRecord = Record<string, any>;

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json() as Promise<T>;
}

function initials(name?: string | null) {
  return (name || 'UDC').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function fmtStatus(value?: string) {
  return (value || 'pending').replaceAll('_', ' ');
}

function timeAgo(value?: string) {
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

type QueueItem = {
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
  legacyHref: string;
};

export function AdminV2Page() {
  const me = useGetCurrentUser();
  const [, setLocation] = useLocation();
  if (me.isLoading) return <div className="av2-root"><div className="av2-body"><div className="av2-skel" /><div className="av2-skel" /></div></div>;
  if (me.isError || !me.data?.user) {
    return <div className="av2-root"><div className="av2-body" style={{ maxWidth: 420, margin: '80px auto' }}>
      <div className="av2-panel" style={{ padding: 28 }}>
        <h1 className="av2-h1">Sign in to your desk</h1>
        <p className="av2-d" style={{ marginTop: 8 }}>This admin desk is protected.</p>
        <button className="av2-btn orange" style={{ marginTop: 16 }} data-testid="button-v2-login" onClick={() => setLocation('/login?next=/admin/v2')}>Continue to sign in</button>
      </div></div></div>;
  }
  if (!['admin', 'administrator'].includes(me.data.user.role || '')) {
    return <div className="av2-root"><div className="av2-body" style={{ maxWidth: 420, margin: '80px auto' }}>
      <div className="av2-panel" style={{ padding: 28 }}>
        <h1 className="av2-h1">Admin access required</h1>
        <p className="av2-d" style={{ marginTop: 8 }}>Buyers, sellers and agents use WhatsApp. This website is for UDC administrators.</p>
      </div></div></div>;
  }
  return <AdminV2 user={me.data.user as AnyRecord} />;
}

function AdminV2({ user }: { user: AnyRecord }) {
  const qc = useQueryClient();
  const logout = useLogoutUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [declineOpen, setDeclineOpen] = useState('');
  const [declineNote, setDeclineNote] = useState('');

  const users = useQuery({ queryKey: ['v2-users'], queryFn: () => loadJson<{ users: AnyRecord[] }>('/api/admin/users/pending-verification') });
  const companies = useQuery({ queryKey: ['v2-companies'], queryFn: () => loadJson<{ companies: AnyRecord[] }>('/api/admin/companies/pending-verification') });
  const companyDocs = useQuery({ queryKey: ['v2-company-docs'], queryFn: () => loadJson<{ documents: AnyRecord[] }>('/api/admin/company-verification-documents') });
  const dealDocs = useQuery({ queryKey: ['v2-deal-docs'], queryFn: () => loadJson<{ documents: AnyRecord[] }>('/api/admin/documents') });
  const buyers = useQuery({ queryKey: ['v2-buyers'], queryFn: () => loadJson<{ requirements: AnyRecord[] }>('/api/admin/buyer-requests') });
  const sellers = useQuery({ queryKey: ['v2-sellers'], queryFn: () => loadJson<{ offers: AnyRecord[] }>('/api/admin/seller-offers') });
  const allUsers = useQuery({ queryKey: ['v2-all-users'], queryFn: () => loadJson<{ users: AnyRecord[] }>('/api/admin/users') });
  const allDeals = useQuery({ queryKey: ['v2-all-deals'], queryFn: () => loadJson<{ deals: AnyRecord[] }>('/api/admin/deals') });
  const audit = useQuery({ queryKey: ['v2-audit'], queryFn: () => loadJson<{ logs: AnyRecord[] }>('/api/admin/audit-log?limit=6&offset=0') });
  const analytics = useQuery({ queryKey: ['v2-analytics'], queryFn: () => loadJson<{ commissionPerformance: AnyRecord[] }>('/api/admin/analytics') });

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

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError('');
    try { await fn(); setDeclineOpen(''); setDeclineNote(''); await refreshAll(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Review failed'); }
    finally { setBusy(''); }
  };

  const queue: QueueItem[] = [];
  for (const item of users.data?.users ?? []) queue.push({
    key: `user-${item.id}`, chip: 'PERSON', chipClass: '', title: item.fullName || 'Unnamed person',
    detail: `${item.email || 'no email'} · ${item.role || 'participant'}`,
    time: timeAgo(item.createdAt), declineNeedsNote: false, legacyHref: '/admin#participant-review',
    approve: () => patch(`/api/admin/users/${item.id}/verification`, { status: 'verified' }),
    decline: () => patch(`/api/admin/users/${item.id}/verification`, { status: 'rejected' }),
  });
  for (const item of companies.data?.companies ?? []) queue.push({
    key: `company-${item.id}`, chip: 'COMPANY', chipClass: 'co', title: item.companyName || 'Unnamed company',
    detail: [item.ownerName, item.ownerRole, item.country].filter(Boolean).join(' · ') || 'Registration details not provided',
    time: timeAgo(item.createdAt), declineNeedsNote: false, legacyHref: '/admin#company-review',
    approve: () => patch(`/api/admin/companies/${item.id}/verification`, { verification_status: 'verified' }),
    decline: () => patch(`/api/admin/companies/${item.id}/verification`, { verification_status: 'rejected' }),
  });
  for (const item of buyers.data?.requirements ?? []) queue.push({
    key: `buyer-${item.id}`, chip: 'BUYER NEED', chipClass: 'trade', title: `${item.quantity ?? ''} ${item.unit || ''} · ${item.destination || 'destination open'}`,
    detail: `Target ${item.currency || ''} ${item.targetPrice || 'not stated'}`,
    time: timeAgo(item.createdAt), declineNeedsNote: false, legacyHref: '/admin#trade-submissions',
    approve: () => patch(`/api/admin/buyer-requests/${item.id}/status`, { status: 'approved' }),
    decline: () => patch(`/api/admin/buyer-requests/${item.id}/status`, { status: 'rejected' }),
  });
  for (const item of sellers.data?.offers ?? []) queue.push({
    key: `seller-${item.id}`, chip: 'SELLER OFFER', chipClass: 'trade', title: `${item.quantity ?? ''} ${item.unit || ''} · ${item.originCountry || 'origin pending'}`,
    detail: `${item.currency || ''} ${item.price ?? ''}/${item.unit || ''}`,
    time: timeAgo(item.createdAt), declineNeedsNote: false, legacyHref: '/admin#trade-submissions',
    approve: () => patch(`/api/admin/seller-offers/${item.id}/status`, { status: 'approved' }),
    decline: () => patch(`/api/admin/seller-offers/${item.id}/status`, { status: 'rejected' }),
  });
  for (const item of (companyDocs.data?.documents ?? []).filter((doc) => doc.status === 'pending')) queue.push({
    key: `cdoc-${item.id}`, chip: 'DOC', chipClass: 'doc', title: `${fmtStatus(item.documentType)} · ${item.companyName || 'company'}`,
    detail: [item.ownerName, item.ownerEmail].filter(Boolean).join(' · ') || 'Company evidence',
    fileUrl: item.fileUrl, time: timeAgo(item.createdAt), declineNeedsNote: true, legacyHref: '/admin#company-evidence',
    approve: () => patch(`/api/admin/company-verification-documents/${item.id}/status`, { status: 'approved' }),
    decline: (note) => patch(`/api/admin/company-verification-documents/${item.id}/status`, { status: 'rejected', reviewNote: note }),
  });
  for (const item of (dealDocs.data?.documents ?? []).filter((doc) => doc.status === 'pending')) queue.push({
    key: `ddoc-${item.id}`, chip: 'DOC', chipClass: 'doc', title: fmtStatus(item.documentType),
    detail: `Deal ${item.dealId || ''}`, fileUrl: item.fileUrl, time: timeAgo(item.createdAt),
    declineNeedsNote: true, legacyHref: '/admin#deal-documents',
    approve: () => patch(`/api/admin/documents/${item.id}/status`, { status: 'approved' }),
    decline: (note) => patch(`/api/admin/documents/${item.id}/status`, { status: 'rejected', reviewNote: note }),
  });

  const queuesLoading = [users, companies, companyDocs, dealDocs, buyers, sellers].some((q) => q.isLoading);
  const queuesFailed = [users, companies, companyDocs, dealDocs, buyers, sellers].some((q) => q.isError);
  const pendingCount = queue.length;

  const deals = allDeals.data?.deals ?? [];
  const running = deals.filter((deal) => !['completed', 'cancelled'].includes(String(deal.status)));
  const commission = analytics.data?.commissionPerformance ?? [];
  const firstCommission = commission[0];

  const pillFor = (status?: string) => {
    if (['completed', 'delivered', 'verified', 'confirmed', 'paid'].includes(status || '')) return 'av2-pill av2-p-ok';
    if (['cancelled', 'rejected', 'disputed'].includes(status || '')) return 'av2-pill av2-p-warn';
    return 'av2-pill av2-p-run';
  };

  const submitDecline = (event: FormEvent, item: QueueItem) => {
    event.preventDefault();
    if (!item.decline) return;
    const note = declineNote.trim();
    if (item.declineNeedsNote && note.length < 5) { setError('Write a short reason (at least 5 characters) before declining a document.'); return; }
    void run(`decline-${item.key}`, () => item.decline!(note));
  };

  const navLink = (href: string, label: string, opts: { on?: boolean; count?: number; tag?: string } = {}) => (
    <Link key={href + label} href={href} className={opts.on ? 'on' : ''} data-testid={`v2-nav-${label.toLowerCase().replaceAll(' ', '-')}`}
      onClick={(event) => {
        setMenuOpen(false);
        if (href.startsWith('#')) { event.preventDefault(); document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' }); }
      }}>
      {label}{opts.count !== undefined && <span className="av2-cnt">{opts.count}</span>}{opts.tag && <span className="av2-tag">{opts.tag}</span>}
    </Link>
  );

  return <div className="av2-root"><div className="av2-wrap">
    {menuOpen && <button className="av2-overlay" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`av2-side ${menuOpen ? 'open' : ''}`} data-testid="v2-sidebar">
      <Link href="/admin/v2" className="av2-logo" onClick={() => setMenuOpen(false)}>UDC<span>.</span></Link>
      <div className="av2-micro">Admin</div>
      <nav className="av2-nav" aria-label="Admin">
        {navLink('/admin/v2', 'Overview', { on: true })}
        {navLink('#queue', 'Review queue', { count: pendingCount })}
        {navLink('/admin#participant-review', 'People')}
        {navLink('/admin#company-review', 'Companies')}
        {navLink('/admin/deals', 'Deals', { tag: running.length ? `${running.length} LIVE` : undefined })}
        {navLink('/admin#deal-documents', 'Documents')}
        {navLink('/admin/whatsapp-readiness', 'WhatsApp')}
        {navLink('/admin', 'Full desk', { tag: 'CLASSIC' })}
      </nav>
      <div className="av2-me"><div className="av2-avatar">{initials(user.fullName)}</div>
        <div style={{ minWidth: 0 }}>{user.fullName || 'Admin'}<small>{user.email || 'Owner · admin'}</small></div>
        <button className="av2-out" aria-label="Sign out" title="Sign out" data-testid="button-v2-logout" onClick={() => logout.mutate()}>⏻</button>
      </div>
    </aside>
    <div className="av2-main">
      <div className="av2-top">
        <button className="av2-burger" aria-label="Open menu" data-testid="button-v2-menu" onClick={() => setMenuOpen(true)}>☰</button>
        <div><div className="ttl">Overview</div><div className="sub">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })} · new admin desk preview</div></div>
        <div className="av2-right">
          <Link href="/admin" className="av2-btn ghost sm" data-testid="v2-open-classic">Classic desk</Link>
        </div>
      </div>
      <div className="av2-body">
        <h1 className="av2-h1" data-testid="v2-headline">{queuesLoading ? 'Loading your desk…' : pendingCount === 0 ? 'All caught up. Nothing waiting.' : <><em>{pendingCount}</em> {pendingCount === 1 ? 'thing needs' : 'things need'} your OK</>}</h1>
        <div className="av2-strip">
          <div className={`av2-stat ${pendingCount ? 'hot' : ''}`} data-testid="v2-stat-pending"><div className="av2-micro2">Pending approvals</div><div className="v">{queuesLoading ? '…' : queuesFailed ? '!' : pendingCount}</div><div className="d">{queuesFailed ? 'a list did not load' : pendingCount ? 'oldest first below' : 'nothing waiting'}</div></div>
          <div className="av2-stat" data-testid="v2-stat-deals"><div className="av2-micro2">Deals running</div><div className="v">{allDeals.isLoading ? '…' : allDeals.isError ? '!' : running.length}</div><div className="d">{allDeals.data ? `${deals.length} total` : ' '}</div></div>
          <div className="av2-stat" data-testid="v2-stat-users"><div className="av2-micro2">Users</div><div className="v">{allUsers.isLoading ? '…' : allUsers.isError ? '!' : allUsers.data?.users.length ?? 0}</div><div className="d">all roles</div></div>
          <div className="av2-stat" data-testid="v2-stat-commission"><div className="av2-micro2">Commission</div><div className="v">{analytics.isLoading ? '…' : analytics.isError ? '!' : firstCommission ? `${firstCommission.amount} ${firstCommission.currency}` : '0'}</div><div className="d">{firstCommission ? `${fmtStatus(firstCommission.status)} · ${firstCommission.count} record${firstCommission.count === 1 ? '' : 's'} · grouped by currency` : 'none recorded yet'}</div></div>
        </div>
        {error && <div className="av2-err" data-testid="v2-error">{error}</div>}
        {queuesFailed && <div className="av2-err" data-testid="v2-queue-error">Some review lists did not load. <button className="av2-btn ghost sm" onClick={() => void refreshAll()} data-testid="button-v2-retry">Retry</button></div>}
        <div className="av2-cols">
          <div id="queue">
            <div className="av2-sect"><span className="av2-micro2">Review queue</span><span className="av2-n" data-testid="v2-queue-count">{queuesLoading ? '…' : pendingCount}</span></div>
            {queuesLoading ? <><div className="av2-skel" /><div className="av2-skel" /><div className="av2-skel" /></>
              : !queue.length ? <div className="av2-empty" data-testid="v2-queue-empty">Nothing waiting. New people, companies, offers and documents land here.</div>
              : queue.map((item) => <div className="av2-qcard" key={item.key} data-testid={`v2-card-${item.key}`}>
                <div className="av2-r1"><span className={`av2-chip ${item.chipClass}`}>{item.chip}</span><span className="av2-t">{item.title}</span>{item.time && <span className="av2-time">{item.time}</span>}</div>
                <div className="av2-d">{item.detail}{item.fileUrl && <> · <a href={item.fileUrl} target="_blank" rel="noreferrer">Open file</a></>}</div>
                <div className="av2-r2">
                  <button className="av2-btn orange sm" disabled={!!busy} data-testid={`button-v2-approve-${item.key}`} onClick={() => void run(`approve-${item.key}`, item.approve)}>{busy === `approve-${item.key}` ? 'Working…' : 'Approve'}</button>
                  {item.declineNeedsNote
                    ? <button className="av2-btn ghost sm" disabled={!!busy} data-testid={`button-v2-decline-${item.key}`} onClick={() => { setDeclineOpen(declineOpen === item.key ? '' : item.key); setDeclineNote(''); }}>{declineOpen === item.key ? 'Cancel' : 'Decline'}</button>
                    : <button className="av2-btn ghost sm" disabled={!!busy} data-testid={`button-v2-decline-${item.key}`} onClick={() => void run(`decline-${item.key}`, () => item.decline!(''))}>{busy === `decline-${item.key}` ? 'Working…' : 'Decline'}</button>}
                  <Link href={item.legacyHref} className="av2-btn ghost sm" data-testid={`v2-details-${item.key}`}>See details</Link>
                </div>
                {declineOpen === item.key && <form className="av2-note" onSubmit={(event) => submitDecline(event, item)}>
                  <textarea aria-label="Reason for declining" placeholder="Reason for declining (at least 5 characters)" maxLength={1000} value={declineNote} onChange={(event) => setDeclineNote(event.target.value)} data-testid={`input-v2-decline-note-${item.key}`} />
                  <div className="av2-r2"><button className="av2-btn sm" type="submit" disabled={!!busy || declineNote.trim().length < 5} data-testid={`button-v2-confirm-decline-${item.key}`}>{busy === `decline-${item.key}` ? 'Working…' : 'Confirm decline'}</button></div>
                </form>}
              </div>)}
          </div>
          <div>
            <div className="av2-panel" data-testid="v2-deals-panel">
              <div className="av2-phead"><span className="av2-micro2">Deals</span><Link className="av2-more" href="/admin/deals">All ›</Link></div>
              {allDeals.isError ? <div className="av2-empty">Deals did not load.</div>
                : allDeals.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /></div>
                : !running.length ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>No deals running yet.</div>
                : <table className="av2-table"><tbody>
                  {running.slice(0, 5).map((deal) => <tr key={deal.id} data-testid={`v2-deal-${deal.id}`}>
                    <td><div className="av2-name">{deal.dealNumber || `Deal ${String(deal.id).slice(0, 8)}`}</div>
                      <div className="av2-det">{deal.quantity !== undefined && deal.quantity !== null && deal.quantity !== '' ? Number(deal.quantity).toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''} {deal.unit || ''}{deal.destination ? ` · ${deal.destination}` : ''}{deal.agreedPrice ? ` · ${deal.currency || ''} ${Number(deal.agreedPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''}</div></td>
                    <td style={{ textAlign: 'right' }}><span className={pillFor(deal.status)}>{fmtStatus(deal.status).toUpperCase()}</span></td>
                  </tr>)}
                </tbody></table>}
            </div>
            <div className="av2-panel" data-testid="v2-activity-panel">
              <div className="av2-phead"><span className="av2-micro2">Latest activity</span><Link className="av2-more" href="/admin#audit-log">All ›</Link></div>
              {audit.isError ? <div className="av2-empty">Activity did not load.</div>
                : audit.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /></div>
                : !(audit.data?.logs ?? []).length ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>No activity yet.</div>
                : <div className="av2-feed">{audit.data!.logs.map((item) => <div key={item.id} data-testid={`v2-activity-${item.id}`}>
                  <strong>{fmtStatus(item.action)}</strong> · {item.actorName || 'System'} · {fmtStatus(item.entityType)}
                  <time>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</time>
                </div>)}</div>}
            </div>
          </div>
        </div>
      </div>
      <div className="av2-foot">UDC admin desk · new preview · classic desk stays available from the menu until you approve this one</div>
    </div>
  </div></div>;
}

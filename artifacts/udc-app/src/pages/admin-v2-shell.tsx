import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useGetCurrentUser, useLogoutUser } from '@workspace/api-client-react';
import { initials, type AnyRecord, type QueueItem } from './admin-v2-data';
import '../admin-v2.css';

/** Sign-in / role gate shared by every v2 admin page. */
export function AdminV2Gate({ children }: { children: (user: AnyRecord) => ReactNode }) {
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
  return <>{children(me.data.user as AnyRecord)}</>;
}

/** The Style B frame every admin page shares: dark sidebar, topbar, sign-out. */
export function AdminV2Shell({ user, active, title, sub, queueCount, children }: {
  user: AnyRecord;
  active: 'overview' | 'people' | 'companies' | 'deals' | 'documents' | 'finance' | 'chats' | 'reports';
  title: string;
  sub?: string;
  queueCount?: number;
  children: ReactNode;
}) {
  const logout = useLogoutUser();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const target = decodeURIComponent(window.location.hash.slice(1));
    const frame = requestAnimationFrame(() => {
      if (target && document.getElementById(target)) window.scrollTo({ top: Math.max(0, document.getElementById(target)!.getBoundingClientRect().top + window.scrollY - 80), behavior: 'instant' });
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  const navLink = (id: string, href: string, label: string, opts: { count?: number; tag?: string } = {}) => (
    <Link key={id} href={href} className={active === id ? 'on' : ''} data-testid={`v2-nav-${label.toLowerCase().replaceAll(' ', '-')}`}
      onClick={(event) => {
        if (href === '#queue') { event.preventDefault(); document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' }); }
        setMenuOpen(false);
      }}>
      {label}{opts.count ? <span className="av2-cnt">{opts.count}</span> : null}{opts.tag ? <span className="av2-tag">{opts.tag}</span> : null}
    </Link>
  );

  return <div className="av2-root"><div className="av2-layout">
    {menuOpen && <button className="av2-overlay" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`av2-side ${menuOpen ? 'open' : ''}`} data-testid="v2-sidebar">
      <Link href="/admin/v2" className="av2-logo" onClick={() => setMenuOpen(false)}>UDC<span>.</span></Link>
      <div className="av2-micro">Admin</div>
      <nav className="av2-nav" aria-label="Admin">
        {navLink('overview', '/admin/v2', 'Overview')}
        {active === 'overview'
          ? navLink('queue', '#queue', 'Review queue', { count: queueCount })
          : navLink('queue', '/admin/v2', 'Review queue', { count: queueCount })}
        {navLink('people', '/admin/v2/people', 'People')}
        {navLink('companies', '/admin/v2/companies', 'Companies')}
        {navLink('deals', '/admin/v2/deals', 'Deals')}
        {navLink('documents', '/admin/v2/documents', 'Documents')}
        {navLink('finance', '/admin/v2/finance', 'Finance')}
        {navLink('chats', '/admin/v2/chats', 'Chats')}
        {navLink('reports', '/admin/v2/reports', 'Reports')}
      </nav>
      <div className="av2-me"><div className="av2-avatar">{initials(user.fullName)}</div>
        <div style={{ minWidth: 0 }}>{user.fullName || 'Admin'}<small>{user.email || 'Owner · admin'}</small></div>
        <button className="av2-out" aria-label="Sign out" title="Sign out" data-testid="button-v2-logout" onClick={() => logout.mutate()}>⏻</button>
      </div>
    </aside>
    <div className="av2-main">
      <div className="av2-top">
        <button className="av2-burger" aria-label="Open menu" data-testid="button-v2-menu" onClick={() => setMenuOpen(true)}>☰</button>
        <div><div className="ttl">{title}</div><div className="sub">{sub ?? ''}</div></div>
        <div className="av2-right">

        </div>
      </div>
      <div className="av2-body">{children}</div>
      <div className="av2-foot">UDC admin desk</div>
    </div>
  </div></div>;
}

/** Approve / decline card list with the decline-note form, shared by all queue pages. */
export function QueueCards({ items, busy, error, setError, run, emptyText }: {
  items: QueueItem[];
  busy: string;
  error: string;
  setError: (message: string) => void;
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
  emptyText: string;
}) {
  const [declineOpen, setDeclineOpen] = useState('');
  const [declineNote, setDeclineNote] = useState('');

  const submitDecline = (event: FormEvent, item: QueueItem) => {
    event.preventDefault();
    if (!item.decline) return;
    const note = declineNote.trim();
    if (item.declineNeedsNote && note.length < 5) { setError('Write a short reason (at least 5 characters) before declining a document.'); return; }
    void run(`decline-${item.key}`, async () => { await item.decline!(note); setDeclineOpen(''); setDeclineNote(''); });
  };

  if (!items.length) return <div className="av2-empty" data-testid="v2-list-empty">{emptyText}</div>;
  return <>{items.map((item) => <div className="av2-qcard" id={item.key} key={item.key} data-testid={`v2-card-${item.key}`}>
    <div className="av2-r1"><span className={`av2-chip ${item.chipClass}`}>{item.chip}</span><span className="av2-t">{item.title}</span>{item.time && <span className="av2-time">{item.time}</span>}</div>
    <div className="av2-d">{item.detail}{item.fileUrl && <> · <a href={item.fileUrl} target="_blank" rel="noreferrer">Open file</a></>}</div>
    <div className="av2-r2">
      <button className="av2-btn orange sm" disabled={!!busy} data-testid={`button-v2-approve-${item.key}`} onClick={() => void run(`approve-${item.key}`, item.approve)}>{busy === `approve-${item.key}` ? 'Working…' : 'Approve'}</button>
      {item.declineNeedsNote
        ? <button className="av2-btn ghost sm" disabled={!!busy} data-testid={`button-v2-decline-${item.key}`} onClick={() => { setDeclineOpen(declineOpen === item.key ? '' : item.key); setDeclineNote(''); }}>{declineOpen === item.key ? 'Cancel' : 'Decline'}</button>
        : <button className="av2-btn ghost sm" disabled={!!busy} data-testid={`button-v2-decline-${item.key}`} onClick={() => void run(`decline-${item.key}`, () => item.decline!(''))}>{busy === `decline-${item.key}` ? 'Working…' : 'Decline'}</button>}
      {item.detailsHref ? <Link href={item.detailsHref} className="av2-btn ghost sm" data-testid={`v2-details-${item.key}`}>See details</Link> : <span className="av2-d">Full submission details are not available in this desk yet.</span>}
    </div>
    {declineOpen === item.key && <form className="av2-note" onSubmit={(event) => submitDecline(event, item)}>
      <textarea aria-label="Reason for declining" placeholder="Reason for declining (at least 5 characters)" maxLength={1000} value={declineNote} onChange={(event) => setDeclineNote(event.target.value)} data-testid={`input-v2-decline-note-${item.key}`} />
      <div className="av2-r2"><button className="av2-btn sm" type="submit" disabled={!!busy || declineNote.trim().length < 5} data-testid={`button-v2-confirm-decline-${item.key}`}>{busy === `decline-${item.key}` ? 'Working…' : 'Confirm decline'}</button></div>
    </form>}
  </div>)}</>;
}

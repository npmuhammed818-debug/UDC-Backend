import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine, ArrowRight, BarChart3, Bell, Boxes, BriefcaseBusiness, Check, ChevronRight,
  CircleAlert, CircleCheck, CircleUserRound, ClipboardList, FileText, Globe2, Inbox, LayoutDashboard,
  LifeBuoy, LogOut, Menu, MessageSquare, Package, Plus, RefreshCw, Search, Send, Settings2, ShieldCheck,
  Sparkles, Truck, UserRound, X, Zap,
} from 'lucide-react';
import {
  getGetAdminOverviewQueryKey, getGetCompanyQueryKey, getGetCurrentUserQueryKey, getGetDashboardQueryKey,
  getGetDealQueryKey, getListBuyerRequestsQueryKey, getListDealDocumentsQueryKey, getListDealMessagesQueryKey,
  getListDealsQueryKey, getListMatchesQueryKey, getListNotificationsQueryKey, getListProductsQueryKey,
  getListSellerListingsQueryKey, useCreateBuyerRequest, useCreateCompany, useCreateDeal,
  useCreateDealDocument, useCreateDealMessage, useCreateProduct, useCreateSellerListing, useDatabaseHealthCheck,
  useGenerateMatches, useGetAdminOverview, useGetCompany, useGetCurrentUser, useGetDashboard, useGetDeal,
  useHealthCheck, useListBuyerRequests, useListDealDocuments, useListDealMessages, useListDeals,
  useListMatches, useListNotifications, useListProducts, useListSellerListings, useLoginUser, useLogoutUser,
  useMarkNotificationRead, useRegisterUser, useUpdateCompany, useUpdateDeal, useUpdateMatch, useUpdateProfile,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { communicationBoundary } from '@/lib/communication';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();
type AnyRecord = Record<string, any>;

const nav = [
  { href: '/dashboard', label: 'Command center', icon: LayoutDashboard },
  { href: '/products', label: 'Product catalog', icon: Boxes },
  { href: '/seller', label: 'Seller supply', icon: Package, roles: ['seller'] },
  { href: '/requirements', label: 'Buyer demand', icon: ClipboardList, roles: ['buyer'] },
  { href: '/matches', label: 'Matching desk', icon: Zap, roles: ['admin'] },
  { href: '/deals', label: 'Deal pipeline', icon: BriefcaseBusiness },
  { href: '/referrals', label: 'Referral & earn', icon: CircleUserRound, roles: ['agent'] },
  { href: '/admin/agents', label: 'Agent controls', icon: CircleUserRound, roles: ['admin'] },
  { href: '/admin/deals', label: 'Deal operations', icon: BriefcaseBusiness, roles: ['admin'] },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/messages', label: 'Negotiation records', icon: MessageSquare },
];

function initials(name?: string | null) {
  return (name || 'UDC').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function formatStatus(value?: string) {
  return (value || 'pending').replaceAll('_', ' ');
}

function StatusPill({ status }: { status?: string }) {
  const tone = ['active', 'accepted', 'confirmed', 'completed', 'delivered', 'verified', 'open'].includes(status || '')
    ? 'status-good' : ['cancelled', 'rejected', 'disputed'].includes(status || '') ? 'status-bad' : 'status-warn';
  return <span className={`status-pill ${tone}`} data-testid={`status-${status || 'pending'}`}>{formatStatus(status)}</span>;
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="space-y-3" data-testid="loading-skeleton">{Array.from({ length: count }).map((_, i) =>
    <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/70" />)}</div>;
}

function EmptyState({ icon: Icon = Inbox, title, body, action }: { icon?: typeof Inbox; title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state" data-testid="empty-state"><div className="empty-icon"><Icon size={20} /></div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function Failure({ retry }: { retry?: () => void }) {
  return <div className="panel flex items-center gap-3 border-destructive/40 bg-destructive/5 p-4" data-testid="error-state"><CircleAlert className="text-destructive" size={18} /><div className="flex-1 text-sm">The workspace could not load this view.</div>{retry && <Button size="sm" variant="outline" onClick={retry} data-testid="button-retry"><RefreshCw size={14} /> Retry</Button>}</div>;
}

function AppLogo({ compact = false }: { compact?: boolean }) {
  return <Link href="/dashboard" className="flex items-center gap-3" data-testid="link-brand"><span className="brand-mark"><span /></span>{!compact && <span className="font-extrabold tracking-[-0.04em] text-[17px]">updown<span className="text-accent">circle</span></span>}</Link>;
}

function Shell({ children, user }: { children: ReactNode; user: AnyRecord }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const logout = useLogoutUser();
  const unread = useListNotifications();
  const unreadCount = (unread.data?.notifications || []).filter((n: AnyRecord) => !n.read).length;
  const isAdmin = ['admin', 'administrator'].includes(user?.role);
  const close = () => setMobileOpen(false);
  return <div className="app-shell">
    <div className="udc-noise" />
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top"><AppLogo /><button className="mobile-close" onClick={close} data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="workspace-label">WORKSPACE <span className="live-dot" /> LIVE</div>
      <nav className="sidebar-nav">{nav.filter((item) => !item.roles || item.roles.includes(user?.role)).map((item) => {
        const Icon = item.icon; const active = location === item.href;
        return <Link key={item.href} href={item.href} onClick={close} className={`nav-item ${active ? 'nav-active' : ''}`} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} /><span>{item.label}</span>{active && <span className="nav-arrow"><ChevronRight size={14} /></span>}</Link>;
      })}</nav>
      <div className="sidebar-spacer" />
      <nav className="sidebar-nav sidebar-bottom">
        <Link href="/notifications" onClick={close} className={`nav-item ${location === '/notifications' ? 'nav-active' : ''}`} data-testid="link-nav-notifications"><Bell size={17} /><span>Notifications</span>{unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}</Link>
        <Link href="/profile" onClick={close} className={`nav-item ${location === '/profile' ? 'nav-active' : ''}`} data-testid="link-nav-profile"><Settings2 size={17} /><span>Profile & company</span></Link>
        {isAdmin && <Link href="/admin" onClick={close} className={`nav-item ${location === '/admin' ? 'nav-active' : ''}`} data-testid="link-nav-admin"><ShieldCheck size={17} /><span>Admin review</span></Link>}
      </nav>
      <div className="sidebar-user"><div className="avatar">{initials(user?.fullName)}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{user?.fullName || 'Workspace user'}</div><div className="truncate text-[11px] text-sidebar-foreground/60">{user?.email || user?.role}</div></div><button onClick={() => logout.mutate()} className="icon-btn text-sidebar-foreground/60 hover:text-sidebar-foreground" data-testid="button-logout" title="Sign out"><LogOut size={16} /></button></div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={21} /></button><div className="breadcrumb"><span>UDC /</span><strong>{location === '/dashboard' ? 'Command center' : location.slice(1).split('/')[0]}</strong></div><div className="topbar-actions"><Link href="/notifications" className="icon-btn relative" data-testid="button-topbar-notifications"><Bell size={18} />{unreadCount > 0 && <span className="notification-dot" />}</Link><div className="topbar-user"><div className="avatar avatar-small">{initials(user?.fullName)}</div><span>{user?.fullName || 'Operator'}</span></div></div></header>
      <div className="page-wrap">{children}</div>
    </main>
  </div>;
}

function Protected({ children }: { children: (user: AnyRecord) => ReactNode }) {
  const [location, setLocation] = useLocation();
  const me = useGetCurrentUser();
  if (me.isLoading) return <div className="auth-loading"><div className="brand-mark"><span /></div><div className="skeleton-line w-48" /><div className="skeleton-line w-32" /></div>;
  if (me.isError || !me.data?.user) return <div className="auth-loading"><div className="auth-card text-center"><div className="brand-mark mx-auto mb-5"><span /></div><h1 className="text-2xl font-extrabold">Sign in to your desk</h1><p className="mt-2 text-sm text-muted-foreground">Your operating workspace is protected.</p><Button className="mt-6" onClick={() => setLocation(`/login?next=${location}`)} data-testid="button-go-login">Continue to sign in <ArrowRight size={15} /></Button></div></div>;
  return <Shell user={me.data.user as AnyRecord}>{children(me.data.user as AnyRecord)}</Shell>;
}

function PageHeader({ eyebrow, title, body, action }: { eyebrow: string; title: string; body?: string; action?: ReactNode }) {
  return <div className="page-header udc-reveal"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{body && <p>{body}</p>}</div>{action}</div>;
}

function Kpi({ label, value, detail, icon: Icon, accent = false }: { label: string; value: string | number; detail?: string; icon: typeof BarChart3; accent?: boolean }) {
  return <div className={`kpi-card ${accent ? 'kpi-accent' : ''}`} data-testid={`kpi-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-start justify-between"><div className="kpi-icon"><Icon size={17} /></div><span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">LIVE</span></div><div className="mt-4 text-3xl font-extrabold tracking-[-.06em]">{value}</div><div className="mt-1 text-xs font-semibold text-muted-foreground">{label}</div>{detail && <div className="mt-3 text-[11px] text-primary">{detail}</div>}</div>;
}

function Dashboard({ user }: { user: AnyRecord }) {
  const dashboard = useGetDashboard();
  const health = useHealthCheck();
  const dbHealth = useDatabaseHealthCheck();
  const overview = (dashboard.data?.dashboard || {}) as AnyRecord;
  const numeric = (keys: string[], fallback: string) => { const key = keys.find((k) => overview[k] !== undefined); return key ? String(overview[key]) : fallback; };
  return <><PageHeader eyebrow={`Good morning, ${user?.fullName?.split(' ')[0] || 'operator'}`} title="Command center" body="A clear view of every opportunity moving through your network." action={user.role === "admin" ? <Link href="/matches" className="button-link" data-testid="link-open-matching"><Sparkles size={15} /> Open matching desk</Link> : <Link href="/deals" className="button-link"><BriefcaseBusiness size={15} /> View deals</Link>} />
    <div className="health-strip" data-testid="status-system-health"><span className="live-dot" /> All systems operational <span className="health-divider" /> API {health.isError ? 'degraded' : 'nominal'} <span className="health-divider" /> data {dbHealth.isError ? 'checking' : 'synced'}</div>
    {dashboard.isError ? <Failure retry={() => dashboard.refetch()} /> : dashboard.isLoading ? <LoadingRows count={2} /> : <div className="kpi-grid"><Kpi label="Open opportunities" value={numeric(['openOpportunities', 'open_opportunities', 'activeDeals'], '—')} detail="requirements + supply" icon={Globe2} accent /><Kpi label="Active deals" value={numeric(['activeDeals', 'active_deals', 'deals'], '—')} detail="in execution" icon={BriefcaseBusiness} /><Kpi label="Pending review" value={numeric(['pendingReview', 'pending_review', 'reviews'], '—')} detail="needs attention" icon={ShieldCheck} /><Kpi label="Unread events" value={numeric(['unreadNotifications', 'unread_notifications'], '—')} detail="since your last visit" icon={Bell} /></div>}
     <div className="execution-boundary" data-testid="communication-boundary"><div className="boundary-channel"><MessageSquare size={16} /><span><strong>{communicationBoundary.channelLabel}</strong><small>{communicationBoundary.channelDescription}</small></span></div><div className="boundary-divider" /><div><strong>UDC is the execution record.</strong><p>{communicationBoundary.udcDescription}</p></div></div>
     <div className="dashboard-grid mt-5"><section className="panel"><div className="section-heading"><div><div className="eyebrow">AKIF / SIGNALS</div><h2>Intelligence, in context</h2></div><span className="akif-chip"><Sparkles size={12} /> AKIF</span></div><div className="akif-note"><div className="akif-orbit"><span /></div><div><strong>Keep the desk moving.</strong><p>Akif will surface the next best action as demand, supply, and verification signals change.</p>{user.role === "admin" && <Link href="/matches" className="text-link" data-testid="link-akif-matches">Review match signals <ArrowRight size={14} /></Link>}</div></div></section><section className="panel"><div className="section-heading"><div><div className="eyebrow">NEXT UP</div><h2>Operator checklist</h2></div></div><div className="checklist"><div><span className="check-icon"><Check size={13} /></span><span>Confirm your company profile</span><Link href="/profile" data-testid="link-check-profile"><ArrowRight size={14} /></Link></div><div><span className="check-icon check-muted"><CircleCheck size={13} /></span><span>{user.role === "admin" ? "Review suggested matches" : "Track your deals"}</span><Link href={user.role === "admin" ? "/matches" : "/deals"} data-testid="link-check-matches"><ArrowRight size={14} /></Link></div><div><span className="check-icon check-muted"><CircleCheck size={13} /></span><span>Prepare a counterparty handoff</span><Link href="/messages" data-testid="link-check-messages"><ArrowRight size={14} /></Link></div></div></section></div>
  </>;
}

async function loadAgentRecords<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json() as Promise<T>;
}

function Referrals({ user }: { user: AnyRecord }) {
  const allowed = user?.role === 'agent';
  const referrals = useQuery({ queryKey: ['agent-referrals'], queryFn: () => loadAgentRecords<{ referrals: AnyRecord[] }>('/api/referrals'), enabled: allowed });
  const commissions = useQuery({ queryKey: ['agent-commissions'], queryFn: () => loadAgentRecords<{ commissions: AnyRecord[] }>('/api/commissions'), enabled: allowed });
  if (!allowed) return <><PageHeader eyebrow="RESTRICTED" title="Referral & earn" /><div className="panel"><EmptyState title="Agent access required" body="This view is for registered UDC agents." /></div></>;
  return <><PageHeader eyebrow="AGENT / REFERRAL & EARN" title="Your introductions" body="Track people you introduced and commissions recorded against your deals. UDC reviews each introduction and approves payouts." />
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">INTRODUCTIONS</div><h2>Referred participants</h2></div></div>
      {referrals.isError ? <Failure retry={() => referrals.refetch()} /> : referrals.isLoading ? <LoadingRows /> : !referrals.data?.referrals.length ? <EmptyState icon={CircleUserRound} title="No introductions recorded" body="Ask the UDC team to record your buyer or seller introduction and agreed referral terms." /> : <div className="data-list">{referrals.data.referrals.map((item) => <div className="data-row" key={item.id}><div className="row-leading"><CircleUserRound size={17} /></div><div className="row-main"><strong>{item.referredName}</strong><span>{formatStatus(item.referredRole)} · Code {item.referralCode}</span></div><StatusPill status={item.status} /></div>)}</div>}
    </div>
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">DEAL REWARDS</div><h2>Commissions</h2></div></div>
      {commissions.isError ? <Failure retry={() => commissions.refetch()} /> : commissions.isLoading ? <LoadingRows /> : !commissions.data?.commissions.length ? <EmptyState icon={BriefcaseBusiness} title="No commission recorded yet" body="A referral becomes eligible only through an agreed deal and UDC's review." /> : <div className="data-list">{commissions.data.commissions.map((item) => <div className="data-row" key={item.id}><div className="row-leading"><BriefcaseBusiness size={17} /></div><div className="row-main"><strong>{item.dealNumber}</strong><span>{item.currency} {item.amount} · {item.commissionType ? formatStatus(item.commissionType) : 'Agreed reward'}</span></div><StatusPill status={item.status} /></div>)}</div>}
    </div>
  </>;
}

function Products({ user }: { user: AnyRecord }) {
  const products = useListProducts(); const create = useCreateProduct(); const qc = useQueryClient(); const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', category: '', hs_code: '', description: '' });
  const rows = (products.data?.products || []).filter((p: AnyRecord) => !search || `${p.name} ${p.category} ${p.hsCode}`.toLowerCase().includes(search.toLowerCase()));
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate({ data: form }, { onSuccess: () => { setForm({ name: '', category: '', hs_code: '', description: '' }); setOpen(false); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); } }); };
  return <><PageHeader eyebrow="CATALOG / REFERENCE" title="Product catalog" body="The shared vocabulary behind every requirement, listing, and deal." action={user.role === "admin" ? <Button onClick={() => setOpen(!open)} data-testid="button-add-product"><Plus size={16} /> Add product</Button> : undefined} />{user.role === "admin" && open && <FormCard title="Add a product" onSubmit={submit} pending={create.isPending} onCancel={() => setOpen(false)}><Field label="Product name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Refined sunflower oil" data-testid="input-product-name" /></Field><div className="form-two"><Field label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Edible oils" data-testid="input-product-category" /></Field><Field label="HS code"><Input value={form.hs_code} onChange={(e) => setForm({ ...form, hs_code: e.target.value })} placeholder="1512" data-testid="input-product-hs-code" /></Field></div><Field label="Description"><textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="A short operational description" data-testid="input-product-description" /></Field></FormCard>}<div className="panel mt-5"><div className="toolbar"><div className="search-wrap"><Search size={15} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" data-testid="input-search-products" /></div><span className="text-xs text-muted-foreground">{rows.length} products in reference</span></div>{products.isError ? <Failure retry={() => products.refetch()} /> : products.isLoading ? <LoadingRows /> : rows.length === 0 ? <EmptyState icon={Boxes} title="No products yet" body="Build your shared catalog before publishing supply or demand." action={user.role === "admin" ? <Button className="mt-4" onClick={() => setOpen(true)} data-testid="button-empty-add-product"><Plus size={15} /> Add first product</Button> : undefined} /> : <div className="data-list">{rows.map((product: AnyRecord) => <div className="data-row" key={product.id} data-testid={`row-product-${product.id}`}><div className="row-leading product-leading"><Package size={17} /></div><div className="row-main"><strong>{product.name}</strong><span>{product.category || 'Uncategorised'} {product.hsCode && `· HS ${product.hsCode}`}</span></div><div className="row-description">{product.description || 'No description added'}</div><ChevronRight size={16} className="text-muted-foreground" /></div>)}</div>}</div></>;
}

function Seller() {
  const listings = useListSellerListings(); const products = useListProducts(); const create = useCreateSellerListing(); const qc = useQueryClient(); const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: '', quantity: '', unit: 'MT', price: '', currency: 'USD', origin_country: '', destination: '', specification: '', monthly_capacity: '', minimum_order_quantity: '', payment_terms: '', inspection_terms: '', availability: '' });
  const productName = (id: string) => products.data?.products.find((p: AnyRecord) => p.id === id)?.name || id;
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate({ data: { ...form, quantity: Number(form.quantity), price: Number(form.price), monthly_capacity: form.monthly_capacity ? Number(form.monthly_capacity) : undefined, minimum_order_quantity: form.minimum_order_quantity ? Number(form.minimum_order_quantity) : undefined } }, { onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: getListSellerListingsQueryKey() }); } }); };
  return <><PageHeader eyebrow="SUPPLY / SELLER DESK" title="Seller supply" body="Publish what you can move, with the commercial detail buyers need." action={<Button onClick={() => setOpen(!open)} data-testid="button-add-listing"><Plus size={16} /> New listing</Button>} />{open && <FormCard title="Publish seller supply" onSubmit={submit} pending={create.isPending} onCancel={() => setOpen(false)}><Field label="Product"><select className="select" required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} data-testid="select-listing-product"><option value="">Choose from catalog</option>{products.data?.products.map((p: AnyRecord) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><div className="form-three"><Field label="Quantity"><Input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid="input-listing-quantity" /></Field><Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} data-testid="input-listing-unit" /></Field><Field label="Price / unit"><Input required type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="input-listing-price" /></Field></div><div className="form-two"><Field label="Origin country"><Input value={form.origin_country} onChange={(e) => setForm({ ...form, origin_country: e.target.value })} placeholder="Türkiye" data-testid="input-listing-origin" /></Field><Field label="Destination"><Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Port of Mombasa" data-testid="input-listing-destination" /></Field></div><div className="form-two"><Field label="Product specification"><Input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} placeholder="Grade, quality, packaging" /></Field><Field label="Availability"><Input value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} placeholder="Ready now or estimated date" /></Field><Field label="Monthly capacity"><Input type="number" min="0.000001" value={form.monthly_capacity} onChange={(e) => setForm({ ...form, monthly_capacity: e.target.value })} placeholder="Optional" /></Field><Field label="Minimum order quantity"><Input type="number" min="0.000001" value={form.minimum_order_quantity} onChange={(e) => setForm({ ...form, minimum_order_quantity: e.target.value })} placeholder="Optional" /></Field></div><div className="form-two"><Field label="Payment terms"><textarea className="textarea" maxLength={2000} value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="Seller's proposed terms" /></Field><Field label="Inspection terms"><textarea className="textarea" maxLength={2000} value={form.inspection_terms} onChange={(e) => setForm({ ...form, inspection_terms: e.target.value })} placeholder="Inspection and certification offered" /></Field></div></FormCard>}<div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">ACTIVE SUPPLY</div><h2>Listings</h2></div><StatusPill status="active" /></div>{listings.isError ? <Failure retry={() => listings.refetch()} /> : listings.isLoading ? <LoadingRows /> : listings.data?.listings.length === 0 ? <EmptyState icon={Truck} title="Your supply board is clear" body="Add a listing when you have a verified quantity ready to place." action={<Button className="mt-4" onClick={() => setOpen(true)} data-testid="button-empty-add-listing"><Plus size={15} /> Add listing</Button>} /> : <div className="data-list">{listings.data?.listings.map((item: AnyRecord) => <div className="data-row" key={item.id} data-testid={`row-listing-${item.id}`}><div className="row-leading supply-leading"><Truck size={17} /></div><div className="row-main"><strong>{productName(item.productId)}</strong><span>{item.quantity} {item.unit} · {item.currency} {item.price}</span></div><div className="row-description">{[item.specification, item.availability, item.monthlyCapacity && `Capacity ${item.monthlyCapacity} ${item.unit}/month`, item.minimumOrderQuantity && `MOQ ${item.minimumOrderQuantity} ${item.unit}`, item.incoterm, item.paymentTerms, item.inspectionTerms].filter(Boolean).join(" · ") || "Commercial details pending"}</div><StatusPill status={item.status} /><ChevronRight size={16} className="text-muted-foreground" /></div>)}</div>}</div></>;
}

function Requirements() {
  const requirements = useListBuyerRequests(); const products = useListProducts(); const create = useCreateBuyerRequest(); const qc = useQueryClient(); const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: '', quantity: '', unit: 'MT', destination: '', target_price: '', currency: 'USD', preferred_incoterm: '', specification: '', contract_duration: '', payment_terms: '', inspection_requirements: '', additional_conditions: '' });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate({ data: { ...form, quantity: Number(form.quantity), target_price: form.target_price ? Number(form.target_price) : undefined } }, { onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: getListBuyerRequestsQueryKey() }); } }); };
  return <><PageHeader eyebrow="DEMAND / BUYER DESK" title="Buyer demand" body="Turn a clear requirement into a shippable opportunity." action={<Button onClick={() => setOpen(!open)} data-testid="button-add-requirement"><Plus size={16} /> New requirement</Button>} />{open && <FormCard title="Create buyer requirement" onSubmit={submit} pending={create.isPending} onCancel={() => setOpen(false)}><Field label="Product"><select className="select" required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} data-testid="select-requirement-product"><option value="">Choose from catalog</option>{products.data?.products.map((p: AnyRecord) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><div className="form-three"><Field label="Quantity"><Input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid="input-requirement-quantity" /></Field><Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} data-testid="input-requirement-unit" /></Field><Field label="Target price"><Input type="number" min="0" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} placeholder="Optional" data-testid="input-requirement-price" /></Field></div><Field label="Destination"><Input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Port, city, or country" data-testid="input-requirement-destination" /></Field><Field label="Preferred Incoterm"><select className="select" value={form.preferred_incoterm} onChange={(e) => setForm({ ...form, preferred_incoterm: e.target.value })}><option value="">Flexible / not specified</option>{["CIF", "FOB", "CFR", "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"].map((term) => <option key={term}>{term}</option>)}</select></Field><Field label="Specification"><Input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} placeholder="Grade, quality, packaging" /></Field><Field label="Contract duration"><Input value={form.contract_duration} onChange={(e) => setForm({ ...form, contract_duration: e.target.value })} placeholder="Trial, monthly, or annual" /></Field><div className="form-two"><Field label="Payment terms"><textarea className="textarea" maxLength={2000} value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="UDC payment flow: DLC to seller, release after destination SGS" /></Field><Field label="Inspection requirements"><textarea className="textarea" maxLength={2000} value={form.inspection_requirements} onChange={(e) => setForm({ ...form, inspection_requirements: e.target.value })} placeholder="Inspection scope or certificate needed" /></Field></div><Field label="Additional conditions"><textarea className="textarea" maxLength={2000} value={form.additional_conditions} onChange={(e) => setForm({ ...form, additional_conditions: e.target.value })} placeholder="Other commercial requirements" /></Field></FormCard>}<div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">BUYER PIPELINE</div><h2>Requirements</h2></div><span className="font-mono text-xs text-muted-foreground">{requirements.data?.requirements.length || 0} total</span></div>{requirements.isError ? <Failure retry={() => requirements.refetch()} /> : requirements.isLoading ? <LoadingRows /> : requirements.data?.requirements.length === 0 ? <EmptyState icon={ClipboardList} title="No open demand" body="Add the exact product and destination you need to activate matching." action={<Button className="mt-4" onClick={() => setOpen(true)} data-testid="button-empty-add-requirement"><Plus size={15} /> Add requirement</Button>} /> : <div className="data-list">{requirements.data?.requirements.map((item: AnyRecord) => <div className="data-row" key={item.id} data-testid={`row-requirement-${item.id}`}><div className="row-leading demand-leading"><Globe2 size={17} /></div><div className="row-main"><strong>{products.data?.products.find((p: AnyRecord) => p.id === item.productId)?.name || item.productId}</strong><span>{item.quantity} {item.unit} · {item.destination}</span></div><div className="row-description">{[item.specification, item.contractDuration, item.preferredIncoterm, item.inspectionRequirements, item.paymentTerms, item.additionalConditions].filter(Boolean).join(" · ") || "Commercial details pending"}</div><StatusPill status={item.status} /><ChevronRight size={16} className="text-muted-foreground" /></div>)}</div>}</div></>;
}

function Matches({ user }: { user: AnyRecord }) {
  const allowed = user.role === 'admin';
  const qc = useQueryClient();
  const candidates = useQuery({ queryKey: ['admin-match-candidates'], queryFn: () => loadAgentRecords<{ buyerRequests: AnyRecord[]; sellerOffers: AnyRecord[] }>('/api/admin/match-candidates'), enabled: allowed });
  const matches = useQuery({ queryKey: ['admin-matches'], queryFn: () => loadAgentRecords<{ matches: AnyRecord[] }>('/api/admin/matches'), enabled: allowed });
  const [requestId, setRequestId] = useState('');
  const [recommendations, setRecommendations] = useState<AnyRecord[]>([]);
  const [matchId, setMatchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (path: string, body?: AnyRecord) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The action could not be completed');
      return payload as AnyRecord;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed'); return null; }
    finally { setBusy(false); }
  };
  if (!allowed) return <><PageHeader eyebrow="RESTRICTED" title="Matching desk" /><EmptyState title="Admin access required" body="UDC reviews matches before sharing them." /></>;
  const selected = candidates.data?.buyerRequests.find((item) => item.id === requestId);
  return <><PageHeader eyebrow="UDC / MATCHING" title="Matching desk" body="Review verified supply against approved buyer demand. UDC approves each match before a deal opens." />
    {error && <div className="error-banner mt-5"><CircleAlert size={15} /> {error}</div>}
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">RECOMMENDATIONS</div><h2>Find a seller</h2></div></div>
      {candidates.isError ? <Failure retry={() => candidates.refetch()} /> : candidates.isLoading ? <LoadingRows /> : <div className="flex gap-2"><select className="select" value={requestId} onChange={(e) => { setRequestId(e.target.value); setRecommendations([]); }}><option value="">Choose an approved buyer request</option>{candidates.data?.buyerRequests.map((item) => <option key={item.id} value={item.id}>{item.quantity} {item.unit} · {item.destination}</option>)}</select><Button disabled={!requestId || busy} onClick={async () => { const result = await run(`/api/admin/buyer-requests/${requestId}/match-recommendations`); if (result) setRecommendations(result.recommendations || []); }}>Find matches</Button></div>}
      {selected && <p className="text-sm mt-3">Buyer target: {selected.targetPrice ? `${selected.currency} ${selected.targetPrice}/${selected.unit}` : 'not stated'} · Product {selected.productId}</p>}
      <div className="data-list mt-4">{recommendations.map((item) => <div className="data-row" key={item.sellerOffer.id}><div className="row-main"><strong>{item.sellerOffer.quantity} {item.sellerOffer.unit} · {item.sellerOffer.currency} {item.sellerOffer.price}/{item.sellerOffer.unit}</strong><span>{item.sellerOffer.originCountry || 'Origin pending'} · Fit {item.score} · {item.reasons.join(', ')}</span></div><Button disabled={busy} onClick={async () => { const result = await run('/api/admin/matches', { buyerRequestId: requestId, sellerListingId: item.sellerOffer.id }); if (result) { setRecommendations([]); qc.invalidateQueries({ queryKey: ['admin-matches'] }); } }}>Approve match</Button></div>)}</div>
    </div>
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">APPROVED MATCHES</div><h2>Open a deal</h2></div></div>
      {matches.isError ? <Failure retry={() => matches.refetch()} /> : matches.isLoading ? <LoadingRows /> : <><select className="select" value={matchId} onChange={(e) => setMatchId(e.target.value)}><option value="">Choose an approved match</option>{matches.data?.matches.filter((item) => item.status === 'approved').map((item) => <option key={item.id} value={item.id}>Buyer {item.buyerRequestId.slice(0, 8)} · Seller offer {item.sellerListingId.slice(0, 8)}</option>)}</select><div className="form-two mt-3"><Field label="Agreed quantity"><Input type="number" min="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field><Field label="Agreed price per unit"><Input type="number" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field></div><Button className="mt-3" disabled={busy || !matchId || Number(quantity) <= 0 || Number(price) <= 0} onClick={async () => { const result = await run('/api/admin/deals', { matchId, quantity: Number(quantity), agreedPrice: Number(price) }); if (result) { setMatchId(''); setQuantity(''); setPrice(''); qc.invalidateQueries({ queryKey: getListDealsQueryKey() }); } }}>Open deal</Button></>}
    </div>
  </>;
}

function Deals() {
  const deals = useListDeals(); const products = useListProducts(); const [search, setSearch] = useState('');
  const rows = (deals.data?.deals || []).filter((d: AnyRecord) => !search || `${d.dealNumber} ${d.status}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeader eyebrow="EXECUTION / PIPELINE" title="Deal pipeline" body="Every active trade, from initiated to delivered." action={<div className="search-wrap search-top"><Search size={15} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deal number" data-testid="input-search-deals" /></div>} /><div className="pipeline-strip"><span className="pipeline-active">ALL <b>{rows.length}</b></span>{['initiated', 'confirmed', 'production', 'shipment', 'completed'].map((step) => <span key={step}>{step} <b>{(rows as AnyRecord[]).filter((d) => d.status === step).length}</b></span>)}</div><div className="panel mt-5">{deals.isError ? <Failure retry={() => deals.refetch()} /> : deals.isLoading ? <LoadingRows /> : rows.length === 0 ? <EmptyState icon={BriefcaseBusiness} title="No deals in motion" body="Accepted matches become deals once both sides are ready to execute." /> : <div className="data-list">{rows.map((deal: AnyRecord) => <Link href={`/deals/${deal.id}`} className="data-row data-row-link" key={deal.id} data-testid={`row-deal-${deal.id}`}><div className="row-leading deal-leading"><BriefcaseBusiness size={17} /></div><div className="row-main"><strong>{deal.dealNumber}</strong><span>{products.data?.products.find((p: AnyRecord) => p.id === deal.productId)?.name || deal.productId} · {deal.quantity} {deal.unit}</span></div><div className="row-description">{deal.currency} {deal.agreedPrice} agreed</div><StatusPill status={deal.status} /><ChevronRight size={16} className="text-muted-foreground" /></Link>)}</div>}</div></>;
}

function DealDetail({ user }: { user: AnyRecord }) {
  const { id = '' } = useParams<{ id: string }>(); const deal = useGetDeal(id, { query: { queryKey: getGetDealQueryKey(id), enabled: !!id } }); const detail = deal.data?.deal as AnyRecord | undefined; const next = ['initiated', 'negotiation', 'verification', 'contract', 'banking', 'shipment', 'inspection', 'payment', 'completed']; const current = next.indexOf(detail?.status || '');
  if (deal.isLoading) return <><PageHeader eyebrow="DEAL / LOADING" title="Opening trade file" /><LoadingRows /></>; if (deal.isError || !detail) return <><PageHeader eyebrow="DEAL / ERROR" title="Trade file unavailable" /><Failure retry={() => deal.refetch()} /></>;
  return <><PageHeader eyebrow={`DEAL / ${detail.dealNumber}`} title={detail.dealNumber} body="Execution room for a verified cross-border opportunity." action={<StatusPill status={detail.status} />} /><div className="detail-grid"><section className="panel"><div className="section-heading"><div><div className="eyebrow">EXECUTION STATUS</div><h2>Move the shipment forward</h2></div></div><div className="deal-timeline">{next.map((stage, i) => <div className={`timeline-step ${i <= current ? 'timeline-done' : ''}`} key={stage}><div className="timeline-dot">{i < current ? <Check size={12} /> : i === current ? <span /> : null}</div><span>{formatStatus(stage)}</span></div>)}</div><div className="deal-facts"><Fact label="Product" value={detail.productId} /><Fact label="Quantity" value={`${detail.quantity} ${detail.unit}`} /><Fact label="Agreed price" value={`${detail.currency} ${detail.agreedPrice}`} /><Fact label="Buyer" value={detail.buyerUserId} /><Fact label="Seller" value={detail.sellerUserId} /></div></section><AkifAside status={detail.status} /><DealTabs dealId={id} user={user} /></div></>;
}

function DealTabs({ dealId, user }: { dealId: string; user: AnyRecord }) {
  const docs = useListDealDocuments(dealId, { query: { queryKey: getListDealDocumentsQueryKey(dealId), enabled: !!dealId } });
  const messages = useListDealMessages(dealId, { query: { queryKey: getListDealMessagesQueryKey(dealId), enabled: !!dealId } });
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('trade_document');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const upload = async (event: FormEvent) => {
    event.preventDefault(); if (!file) return;
    setUploadError(''); setUploading(true);
    try {
      if (file.type !== 'application/pdf' || file.size > 5 * 1024 * 1024) throw new Error('Choose a PDF under 5 MB.');
      const response = await fetch(`/api/deals/${dealId}/documents/upload?documentType=${encodeURIComponent(type)}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
      if (!response.ok) throw new Error('Upload failed. Check the document and try again.');
      setFile(null); await qc.invalidateQueries({ queryKey: getListDealDocumentsQueryKey(dealId) });
    } catch (cause) { setUploadError(cause instanceof Error ? cause.message : 'Upload failed'); }
    finally { setUploading(false); }
  };
  return <section className="panel detail-tabs"><div className="tabs-label"><MessageSquare size={16} /> Deal record</div><div className="room-grid"><div><div className="eyebrow mb-3">DOCUMENTS</div>{docs.isError ? <Failure retry={() => docs.refetch()} /> : docs.isLoading ? <LoadingRows count={2} /> : docs.data?.documents.length ? <div className="mini-list">{docs.data.documents.map((d: AnyRecord) => <a href={d.fileUrl} target="_blank" rel="noreferrer" key={d.id} className="mini-row"><FileText size={15} /><span className="flex-1">{d.documentType}</span><StatusPill status={d.status} /></a>)}</div> : <div className="subtle-empty">No documents shared yet.</div>}
  {['buyer', 'seller'].includes(user.role) && <form onSubmit={upload} className="mini-form mt-4"><select className="select" value={type} onChange={(e) => setType(e.target.value)}><option value="trade_document">Trade document</option><option value="LOI">LOI</option><option value="ICPO">ICPO</option><option value="FCO">FCO</option><option value="SPA">SPA</option><option value="SGS">SGS</option><option value="BL">Bill of lading</option><option value="COA">COA</option></select><Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /><Button size="sm" type="submit" disabled={!file || uploading}>{uploading ? 'Uploading…' : 'Upload PDF'}</Button></form>}{uploadError && <div className="error-banner mt-3">{uploadError}</div>}<p className="text-xs mt-2">UDC reviews documents before sharing them with the other party.</p></div><div><div className="eyebrow mb-3">YOUR NEGOTIATION RECORD</div><div className="handoff-note" data-testid="deal-communication-handoff"><strong>Use {communicationBoundary.channelLabel} for live conversation.</strong><span>{communicationBoundary.udcDescription}</span></div>{messages.isError ? <Failure retry={() => messages.refetch()} /> : messages.isLoading ? <LoadingRows count={2} /> : messages.data?.messages.length ? <div className="message-list">{messages.data.messages.map((m: AnyRecord) => <div className={`message-bubble ${m.senderUserId === user.id ? 'message-own' : ''}`} key={m.id}><span>{m.message}</span><small>{m.senderUserId === user.id ? 'You' : 'UDC'}</small></div>)}</div> : <div className="subtle-empty">No recorded messages for you yet.</div>}</div></div></section>;
}

function AkifAside({ status }: { status: string }) {
  return <aside className="akif-aside"><div className="eyebrow flex items-center gap-2"><Sparkles size={13} /> AKIF LAYER</div><h3>Next best action</h3><p>{status === 'initiated' ? 'Confirm the commercial terms before inviting both parties into the execution room.' : status === 'shipment' ? 'Request final shipping documents and keep the buyer’s destination visible.' : 'Keep counterparties aligned as this trade moves through execution.'}</p><div className="akif-line"><Zap size={14} /> Context-aware guidance</div></aside>;
}

function Documents() {
  const deals = useListDeals(); const [selected, setSelected] = useState('');
  return <><PageHeader eyebrow="EXECUTION / RECORDS" title="Document workspace" body="Keep the file complete before cargo moves." action={<select className="select compact-select" value={selected} onChange={(e) => setSelected(e.target.value)} data-testid="select-document-deal"><option value="">Select a deal</option>{deals.data?.deals.map((d: AnyRecord) => <option key={d.id} value={d.id}>{d.dealNumber}</option>)}</select>} />{selected ? <DealDocs dealId={selected} /> : <div className="panel"><EmptyState icon={FileText} title="Select a deal to open its file" body="Documents are scoped to a deal so the right team sees the right record." /></div>}</>;
}
function DealDocs({ dealId }: { dealId: string }) { const docs = useListDealDocuments(dealId, { query: { queryKey: getListDealDocumentsQueryKey(dealId), enabled: !!dealId } }); return <div className="panel"><div className="section-heading"><div><div className="eyebrow">DEAL FILE</div><h2>Attached records</h2></div><span className="font-mono text-xs">{docs.data?.documents.length || 0} docs</span></div>{docs.isLoading ? <LoadingRows /> : docs.data?.documents.length ? <div className="data-list">{docs.data.documents.map((d: AnyRecord) => <a href={d.fileUrl} target="_blank" rel="noreferrer" className="data-row data-row-link" key={d.id} data-testid={`link-document-${d.id}`}><div className="row-leading product-leading"><FileText size={17} /></div><div className="row-main"><strong>{d.documentType}</strong><span>Approved deal document</span></div><StatusPill status={d.status} /><ArrowDownToLine size={16} /></a>)}</div> : <EmptyState icon={FileText} title="No records attached" body="The deal room is ready for documents from your counterparty." />}</div>; }

function Messages({ user }: { user: AnyRecord }) { const deals = useListDeals(); const [selected, setSelected] = useState(''); return <><PageHeader eyebrow="NEGOTIATION / COUNTERPARTY HANDOFF" title="Negotiation records" body="Use WhatsApp for live communication; keep the commercial decisions and next steps attached to the UDC trade record." action={<select className="select compact-select" value={selected} onChange={(e) => setSelected(e.target.value)} data-testid="select-message-deal"><option value="">Select a deal</option>{deals.data?.deals.map((d: AnyRecord) => <option key={d.id} value={d.id}>{d.dealNumber}</option>)}</select>} /><div className="execution-boundary compact-boundary" data-testid="messages-communication-boundary"><div className="boundary-channel"><MessageSquare size={16} /><span><strong>{communicationBoundary.channelLabel}</strong><small>{communicationBoundary.channelDescription}</small></span></div><div className="boundary-divider" /><p>{communicationBoundary.udcDescription}</p></div>{selected ? <DealMessageRoom dealId={selected} user={user} /> : <div className="panel"><EmptyState icon={MessageSquare} title="Choose a trade record" body="Select a deal to review negotiation notes and prepare a counterparty handoff." /></div>}</>; }
function DealMessageRoom({ dealId, user }: { dealId: string; user: AnyRecord }) {
  const messages = useListDealMessages(dealId, { query: { queryKey: getListDealMessagesQueryKey(dealId), enabled: !!dealId } });
  return <div className="panel message-room"><div className="eyebrow mb-3">UDC RECORD / YOUR MESSAGES</div>{messages.isError ? <Failure retry={() => messages.refetch()} /> : messages.isLoading ? <LoadingRows /> : messages.data?.messages.length ? messages.data.messages.map((m: AnyRecord) => <div className={`message-bubble ${m.senderUserId === user.id ? 'message-own' : ''}`} key={m.id}><span>{m.message}</span><small>{m.senderUserId === user.id ? 'You' : 'UDC'}</small></div>) : <EmptyState icon={MessageSquare} title="No recorded messages yet" body="Use WhatsApp to reach UDC about this trade." />}</div>;
}

function Notifications() { const notifications = useListNotifications(); const mark = useMarkNotificationRead(); const qc = useQueryClient(); return <><PageHeader eyebrow="INBOX / EVENTS" title="Notifications" body="The signals that need your attention, in one place." /> <div className="panel">{notifications.isError ? <Failure retry={() => notifications.refetch()} /> : notifications.isLoading ? <LoadingRows /> : notifications.data?.notifications.length ? <div className="data-list">{notifications.data.notifications.map((n: AnyRecord) => <div className={`notification-row ${n.readAt ? '' : 'notification-unread'}`} key={n.id} data-testid={`row-notification-${n.id}`}><div className="notification-icon"><Bell size={15} /></div><div className="row-main"><strong>{n.title}</strong><span>{n.body}</span></div>{!n.readAt && <Button size="sm" variant="ghost" onClick={() => mark.mutate({ id: n.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) })} data-testid={`button-mark-read-${n.id}`}>Mark read</Button>}</div>)}</div> : <EmptyState icon={Bell} title="You are all caught up" body="New operational events will appear here." />}</div></>; }

function Profile({ user }: { user: AnyRecord }) {
  const company = useGetCompany();
  const documents = useQuery({ queryKey: ['company-verification-documents'], queryFn: () => loadAgentRecords<{ documents: AnyRecord[] }>('/api/company/documents'), enabled: !!company.data?.company });
  const update = useUpdateProfile(); const updateCompany = useUpdateCompany(); const createCompany = useCreateCompany(); const qc = useQueryClient();
  const [name, setName] = useState(user.fullName || ''); const [companyDraft, setCompanyDraft] = useState<AnyRecord | null>(null);
  const [documentType, setDocumentType] = useState('company_registration'); const [uploading, setUploading] = useState(false); const [uploadError, setUploadError] = useState('');
  const companyForm = companyDraft ?? company.data?.company ?? {}; const currentCompanyName = companyForm.companyName || '';
  const setCompanyField = (key: string, value: string) => setCompanyDraft({ ...companyForm, [key]: value }); const [saved, setSaved] = useState(false);
  const saveProfile = (e: FormEvent) => { e.preventDefault(); update.mutate({ data: { full_name: name } }, { onSuccess: () => { setSaved(true); qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); } }); };
  const saveCompany = (e: FormEvent) => { e.preventDefault(); const data = { company_name: currentCompanyName.trim(), registration_number: companyForm.registrationNumber?.trim() || null, country: companyForm.country?.trim() || null, address: companyForm.address?.trim() || null, website: companyForm.website?.trim() || null }; const action = company.data?.company ? updateCompany : createCompany; action.mutate({ data } as any, { onSuccess: () => { setSaved(true); setCompanyDraft(null); qc.invalidateQueries({ queryKey: getGetCompanyQueryKey() }); } }); };
  const uploadCompanyDocument = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 5 * 1024 * 1024) { setUploadError('Choose a PDF up to 5 MB.'); return; }
    setUploading(true); setUploadError('');
    try {
      const response = await fetch(`/api/company/documents/upload?documentType=${encodeURIComponent(documentType)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/pdf' }, body: file });
      if (!response.ok) throw new Error('Upload failed. Check the PDF and try again.');
      await qc.invalidateQueries({ queryKey: ['company-verification-documents'] });
    } catch (cause) { setUploadError(cause instanceof Error ? cause.message : 'Upload failed.'); }
    finally { setUploading(false); }
  };
  return <><PageHeader eyebrow="IDENTITY / SETTINGS" title="Profile & company" body="Your verification context travels with every opportunity." />{saved && <div className="success-banner" data-testid="status-profile-saved"><CircleCheck size={16} /> Changes saved to your workspace.</div>}<div className="settings-grid"><form className="panel settings-card" onSubmit={saveProfile}><div className="section-heading"><div><div className="eyebrow">PERSONAL PROFILE</div><h2>How you appear</h2></div><div className="avatar avatar-large">{initials(name)}</div></div><Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-profile-name" /></Field><Field label="Email"><Input value={user.email || ''} disabled data-testid="input-profile-email" /></Field><Field label="Role"><div className="read-only-value"><UserRound size={15} /> {user.role}</div></Field><Button type="submit" disabled={update.isPending} data-testid="button-save-profile">Save profile</Button></form><form className="panel settings-card" onSubmit={saveCompany}><div className="section-heading"><div><div className="eyebrow">COMPANY / COUNTERPARTY</div><h2>Verification context</h2></div>{company.data?.company && <StatusPill status={company.data.company.verificationStatus} />}</div><Field label="Company name"><Input required value={currentCompanyName} onChange={(e) => setCompanyField("companyName", e.target.value)} placeholder="Registered trading company name" data-testid="input-company-name" /></Field><div className="form-two"><Field label="Registration number"><Input value={companyForm.registrationNumber || ""} onChange={(e) => setCompanyField("registrationNumber", e.target.value)} placeholder="Company registration or tax ID" /></Field><Field label="Country of registration"><Input value={companyForm.country || ""} onChange={(e) => setCompanyField("country", e.target.value)} placeholder="Country" /></Field></div><Field label="Registered address"><textarea className="textarea" maxLength={500} value={companyForm.address || ""} onChange={(e) => setCompanyField("address", e.target.value)} placeholder="Registered business address" /></Field><Field label="Company website"><Input type="url" value={companyForm.website || ""} onChange={(e) => setCompanyField("website", e.target.value)} placeholder="https://example.com" /></Field><div className="read-only-value"><ShieldCheck size={15} /> {company.data?.company ? `Verification: ${formatStatus(company.data.company.verificationStatus)}` : 'Company profile not created'}</div><Button type="submit" disabled={updateCompany.isPending || createCompany.isPending} data-testid="button-save-company">{company.data?.company ? 'Update company' : 'Create company'}</Button></form></div>
    {company.data?.company && <section className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">PRIVATE EVIDENCE</div><h2>Company verification documents</h2></div></div><p className="text-sm text-muted-foreground">Upload a registration, business license, or tax certificate as a PDF. Only you and UDC administrators can access the file.</p><div className="form-two mt-4"><Field label="Document type"><select className="select" value={documentType} onChange={(e) => setDocumentType(e.target.value)}><option value="company_registration">Company registration</option><option value="business_license">Business license</option><option value="tax_certificate">Tax certificate</option><option value="other">Other</option></select></Field><Field label="PDF file (max 5 MB)"><Input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(e) => { void uploadCompanyDocument(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></Field></div>{uploadError && <div className="error-banner mt-3"><CircleAlert size={15} /> {uploadError}</div>}{documents.isError ? <Failure retry={() => documents.refetch()} /> : documents.isLoading ? <LoadingRows count={2} /> : !documents.data?.documents.length ? <EmptyState title="No evidence uploaded" body="Upload a company document to start manual verification." /> : <div className="data-list mt-4">{documents.data.documents.map((item) => <div className="data-row" key={item.id}><div className="row-main"><strong>{formatStatus(item.documentType)}</strong><span>{new Date(item.createdAt).toLocaleDateString()} {item.reviewNote ? `· ${item.reviewNote}` : ''}</span></div><StatusPill status={item.status} />{item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-link">Open PDF</a>}</div>)}</div>}</section>}</>;
}

function DealOperations({ user }: { user: AnyRecord }) {
  const allowed = user.role === 'admin';
  const deals = useQuery({ queryKey: ['admin-deals'], queryFn: () => loadAgentRecords<{ deals: AnyRecord[] }>('/api/admin/deals'), enabled: allowed });
  const [dealId, setDealId] = useState('');
  const selected = deals.data?.deals.find((deal) => deal.id === dealId);
  const instruments = useQuery({ queryKey: ['admin-financials', dealId], queryFn: () => loadAgentRecords<{ instruments: AnyRecord[] }>(`/api/admin/financial-instruments?dealId=${dealId}`), enabled: allowed && !!dealId });
  const inspections = useQuery({ queryKey: ['admin-inspections', dealId], queryFn: () => loadAgentRecords<{ inspections: AnyRecord[] }>(`/api/admin/inspections?dealId=${dealId}`), enabled: allowed && !!dealId });
  const shipments = useQuery({ queryKey: ['admin-shipments', dealId], queryFn: () => loadAgentRecords<{ shipments: AnyRecord[] }>(`/api/admin/shipments?dealId=${dealId}`), enabled: allowed && !!dealId });
  const documents = useQuery({ queryKey: ['admin-documents', dealId], queryFn: () => loadAgentRecords<{ documents: AnyRecord[] }>(`/api/admin/documents?dealId=${dealId}`), enabled: allowed && !!dealId });
  if (!allowed) return <><PageHeader eyebrow="RESTRICTED" title="Deal operations" /><EmptyState title="Admin access required" body="UDC administrators review transaction milestones." /></>;
  const latest = (items?: AnyRecord[]) => items?.[0]?.status || 'not recorded';
  const approvedSgs = documents.data?.documents.some((item) => item.documentType === 'SGS' && item.status === 'approved');
  return <><PageHeader eyebrow="UDC / EXECUTION" title="Deal operations" body="Review the deal, its documents, inspection, shipment, and DLC record together before changing its stage." />
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">ACTIVE FILE</div><h2>Choose a deal</h2></div></div>
      {deals.isError ? <Failure retry={() => deals.refetch()} /> : deals.isLoading ? <LoadingRows /> : <select className="select" value={dealId} onChange={(e) => setDealId(e.target.value)}><option value="">Select deal</option>{deals.data?.deals.map((item) => <option key={item.id} value={item.id}>{item.dealNumber} · {item.status}</option>)}</select>}
      {selected && <div className="mt-4"><div className="data-row"><div className="row-main"><strong>{selected.dealNumber}</strong><span>{selected.quantity} {selected.unit} · {selected.currency} {selected.agreedPrice}/{selected.unit} · {selected.destination || 'Destination pending'}</span></div><StatusPill status={selected.status} /><Link href={`/deals/${selected.id}`} className="text-link">Open deal</Link></div>
        <p className="text-sm mt-4">DLC: {latest(instruments.data?.instruments)} · Inspection: {latest(inspections.data?.inspections)} · Shipment: {latest(shipments.data?.shipments)} · Approved SGS document: {approvedSgs ? 'yes' : 'not recorded'}</p>
        <div className="data-list mt-4">{documents.data?.documents.map((item) => <a href={item.fileUrl} target="_blank" rel="noreferrer" className="data-row data-row-link" key={item.id}><div className="row-main"><strong>{item.documentType}</strong><span>Document for {selected.dealNumber}</span></div><StatusPill status={item.status} /><ArrowDownToLine size={16} /></a>)}</div>
        <p className="text-xs mt-4">UDC's DLC is issued directly to the seller. Payment release follows SGS inspection at destination, subject to bank and contract requirements. Confirm the evidence with the responsible parties before marking milestones complete.</p>
      </div>}
    </div>
  </>;
}

function AgentAdmin({ user }: { user: AnyRecord }) {
  const allowed = user.role === 'admin';
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => loadAgentRecords<{ users: AnyRecord[] }>('/api/admin/users'), enabled: allowed });
  const deals = useQuery({ queryKey: ['admin-deals'], queryFn: () => loadAgentRecords<{ deals: AnyRecord[] }>('/api/admin/deals'), enabled: allowed });
  const referrals = useQuery({ queryKey: ['admin-referrals'], queryFn: () => loadAgentRecords<{ referrals: AnyRecord[] }>('/api/admin/referrals'), enabled: allowed });
  const commissions = useQuery({ queryKey: ['admin-commissions'], queryFn: () => loadAgentRecords<{ commissions: AnyRecord[] }>('/api/admin/commissions'), enabled: allowed });
  const [agentId, setAgentId] = useState(''); const [referredId, setReferredId] = useState(''); const [code, setCode] = useState('');
  const [dealId, setDealId] = useState(''); const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (path: string, body: AnyRecord, method = 'POST') => {
    setBusy(true); setError('');
    try {
      const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The action could not be saved.');
      await Promise.all(['admin-referrals', 'admin-commissions', 'admin-deals'].map((key) => qc.invalidateQueries({ queryKey: [key] })));
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed'); return false; }
    finally { setBusy(false); }
  };
  if (!allowed) return <><PageHeader eyebrow="RESTRICTED" title="Agent controls" /><EmptyState title="Admin access required" body="UDC handles referral attribution and payment review." /></>;
  const agents = users.data?.users.filter((item) => item.role === 'agent') || [];
  const selectedDeal = deals.data?.deals.find((item) => item.id === dealId);
  return <><PageHeader eyebrow="UDC / AGENT NETWORK" title="Agent controls" body="Record legitimate introductions, assign the agent to the deal, and record the agreed reward. Payout is reviewed after completion." />
    {error && <div className="error-banner mt-5"><CircleAlert size={15} /> {error}</div>}
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">REFERRAL</div><h2>Record an introduction</h2></div></div>
      {users.isError ? <Failure retry={() => users.refetch()} /> : <div className="form-two"><Field label="Agent"><select className="select" value={agentId} onChange={(e) => setAgentId(e.target.value)}><option value="">Choose agent</option>{agents.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.email}</option>)}</select></Field><Field label="Introduced participant"><select className="select" value={referredId} onChange={(e) => setReferredId(e.target.value)}><option value="">Choose buyer or seller</option>{users.data?.users.filter((item) => ['buyer', 'seller'].includes(item.role)).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.role}</option>)}</select></Field></div>}
      <Field label="Agreed referral code"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from your referral agreement" /></Field><Button className="mt-3" disabled={busy || !agentId || !referredId || code.trim().length < 3} onClick={async () => { if (await submit('/api/admin/referrals', { agentUserId: agentId, referredUserId: referredId, referralCode: code.trim() })) { setReferredId(''); setCode(''); } }}>Record referral</Button>
      <div className="data-list mt-4">{referrals.data?.referrals.map((item) => <div className="data-row" key={item.id}><div className="row-main"><strong>{users.data?.users.find((u) => u.id === item.referredUserId)?.fullName || item.referredUserId}</strong><span>Agent {users.data?.users.find((u) => u.id === item.agentUserId)?.fullName || item.agentUserId} · {item.referralCode}</span></div><StatusPill status={item.status} />{item.status === 'pending' && <Button size="sm" disabled={busy} onClick={() => submit(`/api/admin/referrals/${item.id}/status`, { status: 'qualified' }, 'PATCH')}>Qualify</Button>}</div>)}</div>
    </div>
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">DEAL ATTRIBUTION</div><h2>Assign and reward an agent</h2></div></div>
      <div className="form-two"><Field label="Deal"><select className="select" value={dealId} onChange={(e) => setDealId(e.target.value)}><option value="">Choose deal</option>{deals.data?.deals.map((item) => <option key={item.id} value={item.id}>{item.dealNumber} · {item.status}</option>)}</select></Field><Field label="Agent"><select className="select" value={agentId} onChange={(e) => setAgentId(e.target.value)}><option value="">Choose agent</option>{agents.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></Field></div>
      <Button variant="outline" disabled={busy || !dealId || !agentId} onClick={() => submit(`/api/admin/deals/${dealId}/agents`, { userId: agentId })}>Assign agent to deal</Button>
      <div className="form-two mt-4"><Field label={`Agreed reward (${selectedDeal?.currency || 'deal currency'})`}><Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><div className="flex items-end"><Button disabled={busy || !dealId || !agentId || Number(amount) <= 0} onClick={async () => { if (await submit('/api/admin/commissions', { dealId, beneficiaryUserId: agentId, amount: Number(amount), commissionType: 'fixed_amount' })) setAmount(''); }}>Record pending commission</Button></div></div>
      <div className="data-list mt-4">{commissions.data?.commissions.filter((item) => agents.some((agent) => agent.id === item.beneficiaryUserId)).map((item) => <div className="data-row" key={item.id}><div className="row-main"><strong>{item.currency} {item.amount}</strong><span>{deals.data?.deals.find((d) => d.id === item.dealId)?.dealNumber || item.dealId}</span></div><StatusPill status={item.status} />{item.status === 'pending' && deals.data?.deals.find((d) => d.id === item.dealId)?.status === 'completed' && <Button size="sm" disabled={busy} onClick={() => submit(`/api/admin/commissions/${item.id}/status`, { status: 'paid' }, 'PATCH')}>Mark paid</Button>}</div>)}</div>
    </div>
  </>;
}

function Admin() {
  const me = useGetCurrentUser();
  const allowed = ['admin', 'administrator'].includes(me.data?.user?.role || '');
  const documents = useQuery({ queryKey: ['admin-documents'], queryFn: () => loadAgentRecords<{ documents: AnyRecord[] }>('/api/admin/documents'), enabled: allowed });
  const users = useQuery({ queryKey: ['admin-pending-users'], queryFn: () => loadAgentRecords<{ users: AnyRecord[] }>('/api/admin/users/pending-verification'), enabled: allowed });
  const companies = useQuery({ queryKey: ['admin-pending-companies'], queryFn: () => loadAgentRecords<{ companies: AnyRecord[] }>('/api/admin/companies/pending-verification'), enabled: allowed });
  const companyDocuments = useQuery({ queryKey: ['admin-company-verification-documents'], queryFn: () => loadAgentRecords<{ documents: AnyRecord[] }>('/api/admin/company-verification-documents'), enabled: allowed });
  const buyers = useQuery({ queryKey: ['admin-pending-buyers'], queryFn: () => loadAgentRecords<{ requirements: AnyRecord[] }>('/api/admin/buyer-requests'), enabled: allowed });
  const sellers = useQuery({ queryKey: ['admin-pending-sellers'], queryFn: () => loadAgentRecords<{ offers: AnyRecord[] }>('/api/admin/seller-offers'), enabled: allowed });
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntityType, setAuditEntityType] = useState('');
  const auditLog = useQuery({
    queryKey: ['admin-audit-log', auditSearch, auditEntityType],
    queryFn: () => loadAgentRecords<{ logs: AnyRecord[]; hasMore: boolean }>(`/api/admin/audit-log?${new URLSearchParams({ limit: '50', ...(auditSearch.trim() ? { q: auditSearch.trim() } : {}), ...(auditEntityType ? { entityType: auditEntityType } : {}) })}`),
    enabled: allowed,
  });
  const qc = useQueryClient();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [companyDocumentNotes, setCompanyDocumentNotes] = useState<Record<string, string>>({});
  const review = async (path: string, status: string, extra: Record<string, unknown> = {}) => {
    setBusy(path); setError('');
    try {
      const response = await fetch(path, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, ...extra }) });
      if (!response.ok) throw new Error('The review could not be saved. Check the record and try again.');
      await qc.invalidateQueries({ queryKey: ['admin-documents'] });
      await qc.invalidateQueries({ queryKey: ['admin-pending-users'] });
      await qc.invalidateQueries({ queryKey: ['admin-pending-buyers'] });
      await qc.invalidateQueries({ queryKey: ['admin-pending-sellers'] });
      await qc.invalidateQueries({ queryKey: ['admin-pending-companies'] });
      await qc.invalidateQueries({ queryKey: ['admin-company-verification-documents'] });
      await qc.invalidateQueries({ queryKey: ['admin-audit-log'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Review failed'); }
    finally { setBusy(''); }
  };
  const reviewCompany = async (companyId: string, verification_status: string) => {
    const path = `/api/admin/companies/${companyId}/verification`;
    setBusy(path); setError('');
    try {
      const response = await fetch(path, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verification_status }) });
      if (!response.ok) throw new Error('Company verification could not be saved. Check the record and try again.');
      await qc.invalidateQueries({ queryKey: ['admin-pending-companies'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Company review failed'); }
    finally { setBusy(''); }
  };
  if (!allowed) return <><PageHeader eyebrow="RESTRICTED" title="Review queue" /><div className="panel"><EmptyState icon={ShieldCheck} title="Admin access required" body="Only UDC administrators can review trade records." /></div></>;
  return <><PageHeader eyebrow="UDC / ADMIN" title="Review queue" body="Review company evidence and trade terms before approving a participant, requirement, or offer." />
    {error && <div className="error-banner mt-5"><CircleAlert size={15} /> {error}</div>}
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">DOCUMENTS</div><h2>Pending document review</h2></div></div>
      {documents.isError ? <Failure retry={() => documents.refetch()} /> : documents.isLoading ? <LoadingRows /> : !documents.data?.documents.some((item) => item.status === 'pending') ? <EmptyState title="No documents waiting" body="Deal uploads appear here for inspection." /> : <div className="data-list">{documents.data.documents.filter((item) => item.status === 'pending').map((item) => <div className="data-row" key={item.id}><div className="row-main"><strong>{item.documentType}</strong><span>Deal {item.dealId}</span></div><a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-link">Open PDF</a><Button size="sm" disabled={!!busy} onClick={() => review(`/api/admin/documents/${item.id}/status`, 'approved')}>Approve</Button><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => review(`/api/admin/documents/${item.id}/status`, 'rejected')}>Reject</Button></div>)}</div>}
    </div>
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">BUSINESS VERIFICATION</div><h2>Company review</h2></div></div>
      {companies.isError ? <Failure retry={() => companies.refetch()} /> : companies.isLoading ? <LoadingRows /> : !companies.data?.companies.length ? <EmptyState title="No companies waiting" body="Submitted company profiles appear here for manual review." /> : <div className="data-list">{companies.data.companies.map((item) => <div className="data-row" key={item.id}><div className="row-main"><strong>{item.companyName}</strong><span>{item.ownerName} · {item.ownerRole} · {item.ownerEmail}</span><span>{[item.registrationNumber, item.country, item.address, item.website].filter(Boolean).join(" · ") || "Registration details not provided"}</span></div><StatusPill status={item.verificationStatus} /><Button size="sm" variant="outline" disabled={!!busy} onClick={() => reviewCompany(item.id, 'under_review')}>Review</Button><Button size="sm" disabled={!!busy} onClick={() => reviewCompany(item.id, 'verified')}>Verify</Button><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => reviewCompany(item.id, 'rejected')}>Reject</Button></div>)}</div>}
    </div>
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">PRIVATE EVIDENCE</div><h2>Company documents</h2></div></div>
      {companyDocuments.isError ? <Failure retry={() => companyDocuments.refetch()} /> : companyDocuments.isLoading ? <LoadingRows /> : !companyDocuments.data?.documents.some((item) => item.status === 'pending') ? <EmptyState title="No company evidence waiting" body="Private company documents submitted for verification appear here." /> : <div className="data-list">{companyDocuments.data.documents.filter((item) => item.status === 'pending').map((item) => <div className="data-row" key={item.id}><div className="row-main"><strong>{formatStatus(item.documentType)} · {item.companyName}</strong><span>{item.ownerName} · {item.ownerEmail}</span><Input aria-label="Reason for rejection" placeholder="Required if rejecting (max 1,000 characters)" maxLength={1000} value={companyDocumentNotes[item.id] || ''} onChange={(e) => setCompanyDocumentNotes((current) => ({ ...current, [item.id]: e.target.value }))} data-testid={`input-company-document-note-${item.id}`} /></div>{item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-link">Open PDF</a>}<Button size="sm" disabled={!!busy} onClick={() => review(`/api/admin/company-verification-documents/${item.id}/status`, 'approved')}>Approve</Button><Button size="sm" variant="ghost" disabled={!!busy || !companyDocumentNotes[item.id]?.trim()} onClick={() => review(`/api/admin/company-verification-documents/${item.id}/status`, 'rejected', { reviewNote: companyDocumentNotes[item.id].trim() })}>Reject</Button></div>)}</div>}
    </div>
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">VERIFICATION</div><h2>Buyers and sellers</h2></div></div>
      {users.isError ? <Failure retry={() => users.refetch()} /> : users.isLoading ? <LoadingRows /> : !users.data?.users.length ? <EmptyState title="No participants waiting" body="New and in-review participants appear here." /> : <div className="data-list">{users.data.users.map((item) => <div className="data-row" key={item.id}><div className="row-main"><strong>{item.fullName}</strong><span>{item.email} · {item.role}</span></div><StatusPill status={item.status} /><Button size="sm" variant="outline" disabled={!!busy} onClick={() => review(`/api/admin/users/${item.id}/verification`, 'under_review')}>Review</Button><Button size="sm" disabled={!!busy} onClick={() => review(`/api/admin/users/${item.id}/verification`, 'verified')}>Verify</Button><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => review(`/api/admin/users/${item.id}/verification`, 'rejected')}>Reject</Button></div>)}</div>}
    </div>
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">DEMAND</div><h2>Buyer requirements</h2></div></div>
      {buyers.isError ? <Failure retry={() => buyers.refetch()} /> : buyers.isLoading ? <LoadingRows /> : !buyers.data?.requirements.length ? <EmptyState title="No requirements waiting" body="Submitted buyer requirements appear here." /> : <div className="data-list">{buyers.data.requirements.map((item) => <div className="data-row" key={item.id}><div className="row-main"><strong>{item.quantity} {item.unit} · {item.destination}</strong><span>Product {item.productId} · Target {item.currency} {item.targetPrice || 'not stated'}</span></div><Button size="sm" disabled={!!busy} onClick={() => review(`/api/admin/buyer-requests/${item.id}/status`, 'approved')}>Approve</Button><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => review(`/api/admin/buyer-requests/${item.id}/status`, 'rejected')}>Reject</Button></div>)}</div>}
    </div>
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">SUPPLY</div><h2>Seller offers</h2></div></div>
      {sellers.isError ? <Failure retry={() => sellers.refetch()} /> : sellers.isLoading ? <LoadingRows /> : !sellers.data?.offers.length ? <EmptyState title="No offers waiting" body="Submitted seller offers appear here." /> : <div className="data-list">{sellers.data.offers.map((item) => <div className="data-row" key={item.id}><div className="row-main"><strong>{item.quantity} {item.unit} · {item.originCountry || 'Origin pending'}</strong><span>Product {item.productId} · {item.currency} {item.price}/{item.unit}</span></div><Button size="sm" disabled={!!busy} onClick={() => review(`/api/admin/seller-offers/${item.id}/status`, 'approved')}>Approve</Button><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => review(`/api/admin/seller-offers/${item.id}/status`, 'rejected')}>Reject</Button></div>)}</div>}
    </div>
    <div className="panel mt-5"><div className="section-heading"><div><div className="eyebrow">OPERATIONS / TRACEABILITY</div><h2>Recent audit activity</h2></div><span className="status-pill status-warn">Latest 50 events</span></div>
      <div className="form-two"><Field label="Search action, record, or administrator"><Input value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} placeholder="e.g. verification, deal, name, email" data-testid="input-audit-search" /></Field><Field label="Record type"><select className="select" value={auditEntityType} onChange={(e) => setAuditEntityType(e.target.value)} data-testid="select-audit-entity"><option value="">All records</option><option value="company">Company</option><option value="company_verification_document">Company evidence</option><option value="deal">Deal</option><option value="document">Deal document</option><option value="user">User</option><option value="buyer_request">Buyer requirement</option><option value="seller_listing">Seller offer</option></select></Field></div>
      {auditLog.isError ? <Failure retry={() => auditLog.refetch()} /> : auditLog.isLoading ? <LoadingRows /> : !auditLog.data?.logs.length ? <EmptyState title="No matching activity" body="Audit events will appear here as administrators and users update records." /> : <div className="data-list mt-4">{auditLog.data.logs.map((item) => <article className="data-row" key={item.id}><div className="row-main"><strong>{formatStatus(item.action)}</strong><span>{item.actorName || 'System'}{item.actorEmail ? ` · ${item.actorEmail}` : ''} · {formatStatus(item.entityType)}{item.entityId ? ` · ${item.entityId}` : ''}</span><span>{new Date(item.createdAt).toLocaleString()}</span>{item.metadata && <details className="mt-1"><summary className="text-link cursor-pointer">Event details</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">{JSON.stringify(item.metadata, null, 2)}</pre></details>}</div></article>)}</div>}
    </div>
  </>;
}

function Auth({ mode }: { mode: 'login' | 'register' }) { const [, setLocation] = useLocation(); const login = useLoginUser(); const register = useRegisterUser(); const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'buyer' }); const [error, setError] = useState(''); const submit = (e: FormEvent) => { e.preventDefault(); setError(''); const done = () => setLocation('/dashboard'); if (mode === 'login') login.mutate({ data: { email: form.email, password: form.password } }, { onSuccess: done, onError: () => setError('We could not verify those details. Try again.') }); else register.mutate({ data: { full_name: form.full_name, email: form.email, password: form.password, role: form.role as 'buyer' | 'seller' | 'agent' } }, { onSuccess: done, onError: () => setError('Registration was not completed. Check your details and try again.') }); }; const pending = login.isPending || register.isPending; return <div className="auth-page"><div className="auth-visual"><AppLogo /><div className="auth-visual-copy"><div className="eyebrow text-accent">TRADE EXECUTION / VERIFIED NETWORK</div><h1>Move the right opportunity, <em>all the way.</em></h1><p>UpDownCircle connects demand, supply, and execution in one focused operating desk.</p></div><div className="auth-quote"><span>“</span><p>Clarity compounds when every handoff has a place.</p><small>— Akif, intelligence layer</small></div></div><div className="auth-panel"><div className="auth-card"><div className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'JOIN THE NETWORK'}</div><h2>{mode === 'login' ? 'Sign in to your desk' : 'Create your operator account'}</h2><p className="auth-sub">{mode === 'login' ? 'Your next shipment is already taking shape.' : 'Start moving verified cross-border opportunities.'}</p>{error && <div className="error-banner" data-testid="status-auth-error"><CircleAlert size={15} /> {error}</div>}<form onSubmit={submit} className="auth-form">{mode === 'register' && <Field label="Full name"><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your full name" data-testid="input-register-name" /></Field>}<Field label="Work email"><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" data-testid="input-auth-email" /></Field><Field label="Password"><Input required minLength={mode === 'register' ? 12 : undefined} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Your password" data-testid="input-auth-password" /></Field>{mode === 'register' && <Field label="I operate as"><select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="select-register-role"><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="agent">Agent</option></select></Field>}<Button className="w-full" type="submit" disabled={pending} data-testid="button-submit-auth">{pending ? 'Working…' : mode === 'login' ? 'Enter workspace' : 'Create account'} <ArrowRight size={15} /></Button></form><div className="auth-switch">{mode === 'login' ? <>New to UDC? <Link href="/register" data-testid="link-register">Create an account</Link></> : <>Already have access? <Link href="/login" data-testid="link-login">Sign in</Link></>}</div></div><div className="auth-footer"><ShieldCheck size={14} /> Verified buyers, sellers, agents, and operators.</div></div></div>; }

function FormCard({ title, onSubmit, onCancel, pending, children }: { title: string; onSubmit: (e: FormEvent) => void; onCancel: () => void; pending: boolean; children: ReactNode }) { return <form className="panel form-card udc-reveal" onSubmit={onSubmit}><div className="section-heading"><h2>{title}</h2><button type="button" className="icon-btn" onClick={onCancel} data-testid="button-cancel-form"><X size={16} /></button></div>{children}<div className="form-actions"><Button type="button" variant="ghost" onClick={onCancel} data-testid="button-dismiss-form">Cancel</Button><Button type="submit" disabled={pending} data-testid="button-submit-form">{pending ? 'Saving…' : 'Save and continue'} <ArrowRight size={15} /></Button></div></form>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function Router() { return <ErrorBoundary><Switch><Route path="/login"><Auth mode="login" /></Route><Route path="/register"><Auth mode="register" /></Route><Route path="/dashboard"><Protected>{(u) => <Dashboard user={u} />}</Protected></Route><Route path="/referrals"><Protected>{(u) => <Referrals user={u} />}</Protected></Route><Route path="/products"><Protected>{(u) => <Products user={u} />}</Protected></Route><Route path="/seller"><Protected>{() => <Seller />}</Protected></Route><Route path="/requirements"><Protected>{() => <Requirements />}</Protected></Route><Route path="/matches"><Protected>{(u) => <Matches user={u} />}</Protected></Route><Route path="/deals/:id"><Protected>{(u) => <DealDetail user={u} />}</Protected></Route><Route path="/deals"><Protected>{() => <Deals />}</Protected></Route><Route path="/documents"><Protected>{() => <Documents />}</Protected></Route><Route path="/messages"><Protected>{(u) => <Messages user={u} />}</Protected></Route><Route path="/notifications"><Protected>{() => <Notifications />}</Protected></Route><Route path="/profile"><Protected>{(u) => <Profile user={u} />}</Protected></Route><Route path="/admin/agents"><Protected>{(u) => <AgentAdmin user={u} />}</Protected></Route><Route path="/admin/deals"><Protected>{(u) => <DealOperations user={u} />}</Protected></Route><Route path="/admin"><Protected>{() => <Admin />}</Protected></Route><Route path="/"><Protected>{(u) => <Dashboard user={u} />}</Protected></Route><Route component={NotFound} /></Switch></ErrorBoundary>; }

export default function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }

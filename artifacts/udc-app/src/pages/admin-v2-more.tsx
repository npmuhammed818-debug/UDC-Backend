import {CommissionProposals} from './admin-v2-commission-proposals';
import {MarketControls} from './admin-v2-market-controls';
import {TrackingControls} from './admin-v2-tracking-controls';
import {FeedbackControls} from './admin-v2-feedback-controls';
import {MeetingControls} from './admin-v2-meeting-controls';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fmtStatus, loadJson, pillFor, timeAgo, useAdminV2Data, type AnyRecord } from './admin-v2-data';
import { AdminV2Gate, AdminV2Shell } from './admin-v2-shell';
import '../admin-v2.css';
import {RecordForm} from '../components/deal-execution-controls';
import { CaseControls } from './admin-v2-case-controls';
import { FinanceControls } from './admin-v2-finance-controls';

function money(amount: unknown, currency?: string) {
  const n = Number(amount);
  if (amount === null || amount === undefined || amount === '' || Number.isNaN(n)) return '—';
  return `${currency || ''} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`.trim();
}

/* ---------------- Finance ---------------- */

function Finance({ user }: { user: AnyRecord }) {
  const instruments = useQuery({ queryKey: ['v2-finance-instruments'], queryFn: () => loadJson<{ instruments: AnyRecord[] }>('/api/admin/financial-instruments') });
  const commissions = useQuery({ queryKey: ['v2-finance-commissions'], queryFn: () => loadJson<{ commissions: AnyRecord[] }>('/api/admin/commissions') });
  const { allDeals, analytics } = useAdminV2Data();
  const dealNumber = new Map((allDeals.data?.deals ?? []).map((d: AnyRecord) => [d.id, d.dealNumber || `Deal ${String(d.id).slice(0, 8)}`]));
  const totals = analytics.data?.commissionPerformance ?? [];
  const loading = instruments.isLoading || commissions.isLoading;

  return <AdminV2Shell user={user} active="finance" title="Finance" sub="Payment instruments (DLC) and commission records">
    <h1 className="av2-h1" data-testid="v2-finance-headline">{loading ? 'Loading…' : 'Money records at a glance'}</h1>
    <div className="av2-strip">
      {totals.length === 0 && !analytics.isLoading
        ? <div className="av2-stat"><div className="av2-micro2">Commission</div><div className="v">0</div><div className="d">none recorded yet</div></div>
        : totals.slice(0, 4).map((row: AnyRecord) => (
          <div className="av2-stat" key={`${row.currency}-${row.status}`} data-testid={`v2-fin-total-${row.currency}-${row.status}`}>
            <div className="av2-micro2">Commission {fmtStatus(row.status)}</div>
            <div className="v">{money(row.amount, row.currency)}</div>
            <div className="d">{row.count} record{row.count === 1 ? '' : 's'}</div>
          </div>
        ))}
    </div>
    <div className="av2-cols">
      <div className="av2-panel" data-testid="v2-fin-instruments">
        <div className="av2-phead"><span className="av2-micro2">Payment instruments</span></div>
        {instruments.isError ? <div className="av2-empty">Instruments did not load.</div>
          : instruments.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /></div>
          : !(instruments.data?.instruments ?? []).length ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>No payment instruments recorded yet. A DLC is recorded here when a deal reaches banking.</div>
          : <table className="av2-table"><tbody>
            {instruments.data!.instruments.map((ins: AnyRecord) => <tr key={ins.id} data-testid={`v2-fin-ins-${ins.id}`}>
              <td><div className="av2-name">{dealNumber.get(ins.dealId) ?? 'Deal'}</div>
                <div className="av2-det">{ins.instrumentType || 'DLC'}{ins.amount ? ` · ${money(ins.amount, ins.currency)}` : ''}{ins.provider ? ` · ${ins.provider}` : ''}</div></td>
              <td style={{ textAlign: 'right' }}><span className={pillFor(ins.status)}>{fmtStatus(ins.status).toUpperCase()}</span><div className="av2-det">{timeAgo(ins.updatedAt)}</div></td>
            </tr>)}
          </tbody></table>}
      </div>
      <div className="av2-panel" data-testid="v2-fin-commissions">
        <div className="av2-phead"><span className="av2-micro2">Commissions</span></div>
        {commissions.isError ? <div className="av2-empty">Commissions did not load.</div>
          : commissions.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /></div>
          : !(commissions.data?.commissions ?? []).length ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>No commissions recorded yet.</div>
          : <table className="av2-table"><tbody>
            {commissions.data!.commissions.map((com: AnyRecord) => <tr key={com.id} data-testid={`v2-fin-com-${com.id}`}>
              <td><div className="av2-name">{money(com.amount, com.currency)}</div>
                <div className="av2-det">{dealNumber.get(com.dealId) ?? 'Deal'} · {fmtStatus(com.commissionType)}{com.paidAt ? ` · paid ${timeAgo(com.paidAt)}` : ''}</div></td>
              <td style={{ textAlign: 'right' }}><span className={pillFor(com.status)}>{fmtStatus(com.status).toUpperCase()}</span></td>
            </tr>)}
          </tbody></table>}
      </div>
    </div>
    <FinanceControls /><CommissionProposals/>
  </AdminV2Shell>;
}

export function AdminV2FinancePage() {
  return <AdminV2Gate>{(user) => <Finance user={user} />}</AdminV2Gate>;
}

/* ---------------- Chats ---------------- */

function Chats({ user }: { user: AnyRecord }) {
  const { allDeals } = useAdminV2Data();
  const meetingRequests = useQuery({ queryKey: ['v2-meeting-requests'], queryFn: () => loadJson<{ requests: AnyRecord[] }>('/api/admin/meeting-requests') });
  const [openDeal, setOpenDeal] = useState<{ id: string; label: string } | null>(null);
  const conversation = useQuery({
    queryKey: ['v2-deal-conversation', openDeal?.id],
    queryFn: () => loadJson<{ events: AnyRecord[] }>(`/api/admin/deals/${openDeal!.id}/conversation`),
    enabled: !!openDeal,
  });
  const room = useQuery({queryKey:['v2-chat-room',openDeal?.id],queryFn:()=>loadJson<AnyRecord>(`/api/admin/deals/${openDeal!.id}/room`),enabled:!!openDeal});
  const deals = allDeals.data?.deals ?? [];
  const requests = meetingRequests.data?.requests ?? [];

  return <AdminV2Shell user={user} active="chats" title="Chats" sub="What AKIF and the deal parties said, deal by deal">
    <h1 className="av2-h1" data-testid="v2-chats-headline">Deal conversations</h1>
    {requests.length > 0 && <div className="av2-panel" data-testid="v2-chats-meetings">
      <div className="av2-phead"><span className="av2-micro2">Meeting asks waiting</span><span className="av2-n">{requests.length}</span></div>
      <div className="av2-feed">
        {requests.slice(0, 8).map((req: AnyRecord) => <div key={req.id} data-testid={`v2-meeting-req-${req.id}`}>
          <strong>{req.dealNumber || 'Deal'}</strong> · {fmtStatus(req.participantRole)} asked: “{String(req.originalText || '').slice(0, 140)}”
          <time>{req.createdAt ? new Date(req.createdAt).toLocaleString() : ''}</time>
        </div>)}
      </div>
    </div>}
    <div className="av2-cols">
      <div className="av2-panel" data-testid="v2-chats-deals">
        <div className="av2-phead"><span className="av2-micro2">Deals</span></div>
        {allDeals.isError ? <div className="av2-empty">Deals did not load.</div>
          : allDeals.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /></div>
          : !deals.length ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>No deals yet.</div>
          : <table className="av2-table"><tbody>
            {deals.map((deal: AnyRecord) => {
              const label = deal.dealNumber || `Deal ${String(deal.id).slice(0, 8)}`;
              return <tr key={deal.id} data-testid={`v2-chat-deal-${deal.id}`}>
                <td><div className="av2-name">{label}</div><div className="av2-det">{fmtStatus(deal.status)}{deal.destination ? ` · ${deal.destination}` : ''}</div></td>
                <td style={{ textAlign: 'right' }}><button className="av2-btn ghost sm" data-testid={`button-v2-read-${deal.id}`} onClick={() => setOpenDeal({ id: deal.id, label })}>{openDeal?.id === deal.id ? 'Open' : 'Read'}</button></td>
              </tr>;
            })}
          </tbody></table>}
      </div>
      <div className="av2-panel" data-testid="v2-chats-thread">
        <div className="av2-phead"><span className="av2-micro2">{openDeal ? openDeal.label : 'Pick a deal'}</span></div>
        {!openDeal ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>Choose a deal on the left to read its conversation.</div>
          : conversation.isError ? <div className="av2-empty">Conversation did not load.</div>
          : conversation.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /><div className="av2-skel" /></div>
          : !(conversation.data?.events ?? []).length ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>Nothing said in this deal yet.</div>
          : <div className="av2-feed">
            {[...conversation.data!.events].reverse().map((ev: AnyRecord) => <div key={ev.id} data-testid={`v2-chat-ev-${ev.id}`}>
              <strong>{fmtStatus(ev.participantRole)}</strong> · {String(ev.originalText || '')}
              {ev.relayed && ev.relayText ? <><br />↪ passed on: “{String(ev.relayText)}”</> : null}
              <time>{ev.createdAt ? new Date(ev.createdAt).toLocaleString() : ''}</time>
            </div>)}
          </div>}
      </div>
    </div>
    {openDeal && <section className="av2-panel" style={{padding:18}}><h2>Full deal room: {openDeal.label}</h2><p className="av2-d">Read-only records below. Up to 200 saved direct messages and 250 timeline events; the WhatsApp conversation above is separate.</p>
      {room.isError ? <p role="alert">Room did not load. <button onClick={()=>void room.refetch()}>Retry</button></p> : room.isLoading ? <div className="av2-skel"/> : room.data && <>
        <details><summary>Participants</summary><div className="av2-feed">{(room.data.participants || []).map((p:AnyRecord)=><div key={p.id}>{p.participantRole} · {p.userId} · {p.status}</div>)}</div></details>
        <details open><summary>Saved direct messages</summary><div className="av2-feed">{!(room.data.messages || []).length?<p>No saved direct messages.</p>:[...room.data.messages].reverse().map((m:AnyRecord)=><div key={m.id} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.message}<time>{new Date(m.createdAt).toLocaleString()}</time></div>)}</div></details>
        <details><summary>Deal timeline</summary><div className="av2-feed">{(room.data.timeline || []).map((e:AnyRecord)=><div key={e.id}>{fmtStatus(e.action)}<time>{new Date(e.createdAt).toLocaleString()}</time></div>)}</div></details>
        <CaseControls key={openDeal.id} dealId={openDeal.id} room={room.data}/><MeetingControls key={`meeting-${openDeal.id}`} dealId={openDeal.id} room={room.data}/>{(room.data.shipments||[]).map((shipment:AnyRecord)=><TrackingControls key={shipment.id} shipment={shipment}/>)}
      </>}
    </section>}
  <AnnouncementControls/></AdminV2Shell>;
}

function AnnouncementControls(){return <section className="av2-panel" style={{padding:18,marginTop:20}}><p className="av2-d">In-app only. The selected role receives this only when its account is active and its announcement preference is on. Review the audience and wording first.</p><RecordForm title="Reviewed in-app announcement" path="/api/admin/announcements" fields={[{key:'audience',label:'Opted-in verified audience',options:['buyer','seller','agent']},{key:'title',label:'Exact title',required:true,minLength:3,maxLength:100},{key:'body',label:'Exact announcement',required:true,multiline:true,minLength:5,maxLength:1000}]} confirmation="I reviewed this audience and exact wording. I approve one in-app notice to opted-in active accounts, not WhatsApp or email. Submitting twice sends twice." onSaved={async()=>{}}/></section>;}
export function AdminV2ChatsPage() {
  return <AdminV2Gate>{(user) => <Chats user={user} />}</AdminV2Gate>;
}

/* ---------------- Reports ---------------- */

function ReportRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="av2-stat"><div className="av2-micro2">{label}</div><div className="v">{value}</div><div className="d">{sub ?? ' '}</div></div>;
}

function ActivityLog() {
  const [offset, setOffset] = useState(0);
  const activity = useQuery({
    queryKey: ['v2-activity-page', offset],
    queryFn: () => loadJson<{ logs: AnyRecord[]; hasMore: boolean; nextOffset: number | null }>(`/api/admin/audit-log?limit=50&offset=${offset}`),
  });
  return <section id="activity" className="av2-panel" data-testid="v2-reports-activity" style={{ marginTop: 24, scrollMarginTop: 80 }}>
    <div className="av2-phead"><h2 className="av2-micro2">Latest activity</h2></div>
    {activity.isError ? <div className="av2-empty">Activity did not load. <button className="av2-btn ghost sm" onClick={() => void activity.refetch()}>Retry</button></div>
      : activity.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /></div>
      : !activity.data?.logs.length ? <div className="av2-empty">No activity yet.</div>
      : <div className="av2-feed">{activity.data.logs.map((item) => <div key={item.id}>
        <strong>{fmtStatus(item.action)}</strong> · {item.actorName || 'System'} · {fmtStatus(item.entityType)}
        <time>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</time>
      </div>)}</div>}
    <div className="av2-r2" style={{ padding: 16 }}>
      <button className="av2-btn ghost sm" disabled={!offset || activity.isFetching} onClick={() => setOffset(Math.max(0, offset - 50))}>Newer</button>
      <button className="av2-btn ghost sm" disabled={!activity.data?.hasMore || activity.isFetching || offset >= 5000} onClick={() => setOffset(activity.data?.nextOffset ?? offset)}>Older</button>
    </div>
  </section>;
}

function Reports({ user }: { user: AnyRecord }) {
  const { analytics, allDeals, allUsers } = useAdminV2Data();
  const a = analytics.data;
  const deals = allDeals.data?.deals ?? [];
  const running = deals.filter((d: AnyRecord) => !['completed', 'cancelled'].includes(d.status || ''));
  const stageRows = (a?.stages ?? []).slice().sort((x: AnyRecord, y: AnyRecord) => y.count - x.count);
  const maxStage = Math.max(1, ...stageRows.map((s: AnyRecord) => s.count));

  return <AdminV2Shell user={user} active="reports" title="Reports" sub="How the platform is doing, in numbers">
    <h1 className="av2-h1" data-testid="v2-reports-headline">The numbers right now</h1>
    <ActivityLog />
    <div className="av2-strip">
      <ReportRow label="Deals running" value={allDeals.isLoading ? '…' : String(running.length)} sub={`${deals.length} total`} />
      <ReportRow label="Deals completed" value={analytics.isLoading ? '…' : String(stageRows.find((s: AnyRecord) => s.status === 'completed')?.count ?? 0)} sub="all time" />
      <ReportRow label="Users" value={allUsers.isLoading ? '…' : String(allUsers.data?.users.length ?? 0)} sub="all roles" />
      <ReportRow label="Completed value" value={(a?.completedValues ?? []).length ? a!.completedValues.map((v: AnyRecord) => money(v.value, v.currency)).join(' + ') : '0'} sub="finished deals only" />
    </div>
    <div className="av2-cols">
      <div className="av2-panel" data-testid="v2-rep-stages">
        <div className="av2-phead"><span className="av2-micro2">Deals by stage</span></div>
        {analytics.isError ? <div className="av2-empty">Numbers did not load.</div>
          : analytics.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /></div>
          : !stageRows.length ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>No deals yet.</div>
          : <table className="av2-table"><tbody>
            {stageRows.map((s: AnyRecord) => <tr key={s.status} data-testid={`v2-rep-stage-${s.status}`}>
              <td style={{ width: '40%' }}><span className={pillFor(s.status)}>{fmtStatus(s.status).toUpperCase()}</span></td>
              <td><div style={{ background: 'var(--av2-bar, #2c2c2c)', borderRadius: 3, height: 8, width: `${Math.max(4, Math.round((s.count / maxStage) * 100))}%` }} /></td>
              <td style={{ textAlign: 'right' }} className="av2-name">{s.count}</td>
            </tr>)}
          </tbody></table>}
      </div>
      <div>
        <div className="av2-panel" data-testid="v2-rep-products">
          <div className="av2-phead"><span className="av2-micro2">Top products</span></div>
          {analytics.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /></div>
            : !(a?.products ?? []).length ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>No deals yet.</div>
            : <div className="av2-feed">{a!.products.map((p: AnyRecord) => <div key={p.product} data-testid={`v2-rep-prod-${p.product}`}><strong>{p.product}</strong><time>{p.dealCount} deal{p.dealCount === 1 ? '' : 's'}</time></div>)}</div>}
        </div>
        <div className="av2-panel" data-testid="v2-rep-countries">
          <div className="av2-phead"><span className="av2-micro2">Buyer and seller countries</span></div>
          {analytics.isLoading ? <div style={{ padding: 16 }}><div className="av2-skel" /></div>
            : !(a?.buyerCountries ?? []).length && !(a?.sellerCountries ?? []).length ? <div className="av2-empty" style={{ border: 'none', margin: 0 }}>No deals yet.</div>
            : <div className="av2-feed">
              {(a?.buyerCountries ?? []).slice(0, 5).map((c: AnyRecord) => <div key={`b-${c.country}`}><strong>{c.country || 'Unknown'}</strong><time>{c.dealCount} buy-side</time></div>)}
              {(a?.sellerCountries ?? []).slice(0, 5).map((c: AnyRecord) => <div key={`s-${c.country}`}><strong>{c.country || 'Unknown'}</strong><time>{c.dealCount} sell-side</time></div>)}
            </div>}
        </div>
      </div>
    </div>
  <FeedbackControls /><MarketControls /></AdminV2Shell>;
}

export function AdminV2ReportsPage() {
  return <AdminV2Gate>{(user) => <Reports user={user} />}</AdminV2Gate>;
}

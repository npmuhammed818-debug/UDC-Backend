import { useState } from 'react';
import { Link } from 'wouter';
import { fmtStatus, pillFor, timeAgo, useAdminV2Data, type AnyRecord } from './admin-v2-data';
import { AdminV2Gate, AdminV2Shell, QueueCards } from './admin-v2-shell';
import '../admin-v2.css';

export function AdminV2Page() {
  return <AdminV2Gate>{(user) => <AdminV2 user={user} />}</AdminV2Gate>;
}

function AdminV2({ user }: { user: AnyRecord }) {
  const data = useAdminV2Data();
  const { queue, queuesLoading, queuesFailed, pendingCount, running, allDeals, allUsers, audit, analytics, refreshAll } = data;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError('');
    try { await fn(); await refreshAll(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Review failed'); }
    finally { setBusy(''); }
  };

  const commission = analytics.data?.commissionPerformance ?? [];
  const firstCommission = commission[0];

  return <AdminV2Shell user={user} active="overview" title="Overview" queueCount={pendingCount || undefined}
    sub={`${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })} · admin desk`}>
    <h1 className="av2-h1" data-testid="v2-headline">{queuesLoading ? 'Loading your desk…' : pendingCount === 0 ? 'All caught up. Nothing waiting.' : <><em>{pendingCount}</em> {pendingCount === 1 ? 'thing needs' : 'things need'} your OK</>}</h1>
    <div className="av2-strip">
      <div className={`av2-stat ${pendingCount ? 'hot' : ''}`} data-testid="v2-stat-pending"><div className="av2-micro2">Pending approvals</div><div className="v">{queuesLoading ? '…' : queuesFailed ? '!' : pendingCount}</div><div className="d">{queuesFailed ? 'a list did not load' : pendingCount ? 'oldest first below' : 'nothing waiting'}</div></div>
      <div className="av2-stat" data-testid="v2-stat-deals"><div className="av2-micro2">Deals running</div><div className="v">{allDeals.isLoading ? '…' : allDeals.isError ? '!' : running.length}</div><div className="d">{allDeals.data ? `${data.deals.length} total` : ' '}</div></div>
      <div className="av2-stat" data-testid="v2-stat-users"><div className="av2-micro2">Users</div><div className="v">{allUsers.isLoading ? '…' : allUsers.isError ? '!' : allUsers.data?.users.length ?? 0}</div><div className="d">all roles</div></div>
      <div className="av2-stat" data-testid="v2-stat-commission"><div className="av2-micro2">Commission</div><div className="v">{analytics.isLoading ? '…' : analytics.isError ? '!' : firstCommission ? `${firstCommission.amount} ${firstCommission.currency}` : '0'}</div><div className="d">{firstCommission ? `${fmtStatus(firstCommission.status)} · ${firstCommission.count} record${firstCommission.count === 1 ? '' : 's'} · grouped by currency` : 'none recorded yet'}</div></div>
    </div>
    {error && <div className="av2-err" data-testid="v2-error">{error}</div>}
    {queuesFailed && <div className="av2-err" data-testid="v2-queue-error">Some review lists did not load. <button className="av2-btn ghost sm" onClick={() => void refreshAll()} data-testid="button-v2-retry">Retry</button></div>}
    <div className="av2-cols">
      <div id="queue">
        <div className="av2-sect"><span className="av2-micro2">Review queue</span><span className="av2-n" data-testid="v2-queue-count">{queuesLoading ? '…' : pendingCount}</span></div>
        {queuesLoading ? <><div className="av2-skel" /><div className="av2-skel" /><div className="av2-skel" /></>
          : <QueueCards items={queue} busy={busy} error={error} setError={setError} run={run} emptyText="Nothing waiting. New people, companies, offers and documents land here." />}
      </div>
      <div>
        <div className="av2-panel" data-testid="v2-deals-panel">
          <div className="av2-phead"><span className="av2-micro2">Deals</span><Link className="av2-more" href="/admin/v2/deals">All ›</Link></div>
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
          <div className="av2-phead"><span className="av2-micro2">Latest activity</span><Link className="av2-more" href="/admin/v2/reports">All ›</Link></div>
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
  </AdminV2Shell>;
}

export { timeAgo };

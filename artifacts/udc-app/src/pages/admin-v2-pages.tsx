import { useActionLock } from '@/hooks/use-action-lock';
import {DraftControls} from './admin-v2-draft-controls';
import {DocumentControls} from './admin-v2-document-controls';
import { useState } from 'react';
import { useAdminV2Data, type AnyRecord } from './admin-v2-data';
import { AdminV2Gate, AdminV2Shell, QueueCards } from './admin-v2-shell';
import '../admin-v2.css';
import {CompanyControls} from './admin-v2-company-controls';
import {PeopleControls} from './admin-v2-people-controls';

function useQueuePage() {
  const data = useAdminV2Data();
  const [busy, setBusy] = useState('');
  const actionLock = useActionLock();
  const [error, setError] = useState('');
  const run = async (key: string, fn: () => Promise<void>) => {
    if (!actionLock.acquire()) return;
    setBusy(key); setError('');
    try { await fn(); await data.refreshAll(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Review failed'); }
    finally { actionLock.release(); setBusy(''); }
  };
  return { data, busy, error, setError, run };
}

function QueuePage({ user, active, title, sub, chips, emptyText }: {
  user: AnyRecord;
  active: 'people' | 'companies' | 'documents';
  title: string;
  sub: string;
  chips: string[];
  emptyText: string;
}) {
  const { data, busy, error, setError, run } = useQueuePage();
  const items = data.queue.filter((item) => chips.includes(item.chip));
  return <AdminV2Shell user={user} active={active} title={title} sub={sub} queueCount={data.pendingCount || undefined}>
    <h1 className="av2-h1">{data.queuesLoading ? 'Loading…' : items.length === 0 ? 'Nothing waiting here.' : <><em>{items.length}</em> waiting for your OK</>}</h1>
    {error && <div className="av2-err">{error}</div>}
    {data.queuesFailed && <div className="av2-err">Some lists did not load. <button className="av2-btn ghost sm" onClick={() => void data.refreshAll()}>Retry</button></div>}
    {data.queuesLoading ? <><div className="av2-skel" /><div className="av2-skel" /></>
      : <QueueCards items={items} busy={busy} error={error} setError={setError} run={run} emptyText={emptyText} />}
    {active === 'people' && <PeopleControls />}
    {active === 'companies' && <CompanyControls />}
    {active === 'documents' && <><DocumentControls /><DraftControls/></>}
  </AdminV2Shell>;
}

export function AdminV2PeoplePage() {
  return <AdminV2Gate>{(user) => <QueuePage user={user} active="people" title="People"
    sub="Approve or decline each registered person"
    chips={['PERSON']} emptyText="No people waiting. New registrations land here." />}</AdminV2Gate>;
}

export function AdminV2CompaniesPage() {
  return <AdminV2Gate>{(user) => <QueuePage user={user} active="companies" title="Companies"
    sub="Approve or decline each company with its papers"
    chips={['COMPANY']} emptyText="No companies waiting. New company registrations land here." />}</AdminV2Gate>;
}

export function AdminV2DocumentsPage() {
  return <AdminV2Gate>{(user) => <QueuePage user={user} active="documents" title="Documents"
    sub="Company evidence and deal documents sent in for review"
    chips={['DOC']} emptyText="No documents waiting. New uploads land here." />}</AdminV2Gate>;
}

import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from './ui/button';

type Row = Record<string, any>;
const label = (value: string) => value.replaceAll('_', ' ');
async function read(path: string) { const r = await fetch(path, { credentials: 'same-origin' }); if (!r.ok) throw new Error('Records unavailable'); return r.json(); }

export function DealExecutionView({ dealId, canLeaveFeedback }: { dealId: string; canLeaveFeedback: boolean }) {
  const execution = useQuery({ queryKey: ['deal-execution', dealId], queryFn: () => read(`/api/deals/${dealId}/execution`), refetchInterval: 30_000 });
  const tracking = useQuery({ queryKey: ['deal-tracking', dealId], queryFn: () => read(`/api/deals/${dealId}/tracking`), refetchInterval: 30_000 });
  const [rating, setRating] = useState('5'); const [comment, setComment] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const feedback = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const r = await fetch(`/api/deals/${dealId}/feedback`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: Number(rating), comment: comment.trim() }) });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error === 'feedback_already_submitted' ? 'You have already submitted feedback for this deal.' : 'Feedback could not be saved. Confirm the deal is completed and try again.');
      setSaved(true); await execution.refetch();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Feedback could not be saved.'); }
    finally { setBusy(false); }
  };
  const refresh = () => { void execution.refetch(); void tracking.refetch(); };
  return <section className="panel detail-tabs" data-testid="deal-execution-view"><div className="section-heading"><div><div className="eyebrow">COORDINATION / DELIVERY</div><h2>Meetings and trade updates</h2></div><Button variant="outline" size="sm" onClick={refresh}>Refresh</Button></div>
    {(execution.isError || tracking.isError) && <p className="error-banner" role="alert">Some updates could not be loaded. Use Refresh to try again.</p>}
    {(execution.isLoading || tracking.isLoading) && <p>Loading trade updates…</p>}
    <div className="data-list">{(execution.data?.meetings ?? []).map((row: Row) => <div className="data-row" key={row.id}><div className="row-main"><strong>{row.provider === 'in_person' ? 'Face-to-face meeting' : 'Video meeting'} · {label(row.status)}</strong><span>{row.scheduledAt ? new Date(row.scheduledAt).toLocaleString() : 'Time pending'}{row.agenda ? ` · ${row.agenda}` : ''}</span></div>{row.meetingUrl && row.provider !== 'in_person' && <a className="text-link" href={row.meetingUrl} target="_blank" rel="noreferrer">Join meeting</a>}</div>)}</div>
    {!execution.isLoading && !execution.isError && !execution.data?.meetings?.length && <p className="text-sm mt-3">No meeting scheduled yet. You can request one in your WhatsApp deal conversation.</p>}
    <div className="form-two mt-4"><div><h3>Inspection updates</h3>{(tracking.data?.inspections ?? []).map((row: Row) => <div className="data-row" key={row.id}><div className="row-main"><strong>{row.inspectorName || 'Inspection'} · {label(row.status)}</strong><span>{row.resultSummary || 'No reviewed result recorded.'}</span></div></div>)}</div><div><h3>Shipment updates</h3>{(tracking.data?.shipments ?? []).map((row: Row) => <div className="data-row" key={row.id}><div className="row-main"><strong>{row.carrier || 'Carrier pending'} · {label(row.status)}</strong><span>{row.trackingNumber || 'Reference pending'} · {row.origin || 'Origin pending'} → {row.destination || 'Destination pending'}{row.estimatedArrival ? ` · Estimated arrival ${new Date(row.estimatedArrival).toLocaleString()}` : ''}</span></div></div>)}</div></div>
    <p className="mt-4 text-sm">Customs: {label(execution.data?.customs?.status || 'not_started')}{execution.data?.customs?.port ? ` · ${execution.data.customs.port}` : ''}</p>
    <div className="data-list mt-3">{(execution.data?.cases ?? []).map((row: Row) => <div className="data-row" key={row.id}><div className="row-main"><strong>{label(row.caseType)} · {label(row.status)}</strong><span>{row.summary}{row.resolution ? ` · ${row.resolution}` : ''}</span></div></div>)}</div>
    <h3 className="mt-5">Reviewed feedback</h3>{(execution.data?.feedback ?? []).map((row: Row) => <p className="mt-2 text-sm" key={row.id}>{row.rating}/5{row.comment ? ` · ${row.comment}` : ''}</p>)}
    {canLeaveFeedback && !saved && <form className="mt-4 border-t border-border pt-4" onSubmit={feedback}><h3>Review your completed trade</h3><label className="block text-sm mt-3">Rating<select className="select mt-2" value={rating} onChange={e => setRating(e.target.value)}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label><label className="block text-sm mt-3">Comment (optional)<textarea className="textarea mt-2" maxLength={1500} value={comment} onChange={e => setComment(e.target.value)} /></label><Button type="submit" className="mt-3" disabled={busy}>{busy ? 'Saving…' : 'Submit for review'}</Button>{error && <p role="alert" className="error-banner mt-3">{error}</p>}</form>}
    {saved && <p className="success-banner mt-3" role="status">Feedback submitted for UDC review.</p>}
  </section>;
}

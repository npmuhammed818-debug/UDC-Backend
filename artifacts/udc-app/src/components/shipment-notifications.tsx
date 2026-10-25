import { useEffect, useState } from 'react';
import { Button } from './ui/button';

type Entry = { id: string; dealId: string; status: string; attempts: number; deliveryStatus: string;
  lastFailureCategory: string | null; updatedAt: string };
type Report = { entries: Entry[]; dispatchEnabled: boolean };
export function ShipmentNotificationsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  async function refresh(signal?: AbortSignal) {
    setLoading(true); setError(false);
    try {
      const response = await fetch('/api/admin/notifications/whatsapp-shipment-outbox', { credentials: 'same-origin', cache: 'no-store', signal });
      if (!response.ok) throw Error();
      const data = await response.json();
      if (!signal?.aborted) setReport(data);
    } catch { if (!signal?.aborted) setError(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, []);
  return <main className="panel p-5 space-y-4">
    <h1 className="text-2xl font-bold">Shipment notifications</h1>
    <p>Review the latest 100 notification attempts. Provider acceptance does not confirm delivery.</p>
    {report && <p role="status">Automatic sending is {report.dispatchEnabled ? 'enabled' : 'disabled'}.</p>}
    <p>Uncertain attempts need human investigation and are never automatically resent. Failed delivery receipts also require review.</p>
    <Button disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh status'}</Button>
    {error && <p role="alert">Notification status is unavailable. Please try again.</p>}
    {!error && report && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="sr-only">Shipment notification delivery status</caption>
      <thead><tr><th>Deal</th><th>Submission</th><th>Delivery</th><th>Attempts</th><th>Issue</th></tr></thead>
      <tbody>{report.entries.map(entry => <tr key={entry.id}>
        <td className="py-3">{entry.dealId.slice(0, 8)}</td><td>{entry.status}</td><td>{entry.deliveryStatus}</td>
        <td>{entry.attempts}/3</td><td>{entry.lastFailureCategory?.replaceAll('_', ' ') ?? '—'}</td>
      </tr>)}</tbody>
    </table>{!report.entries.length && <p>No notification attempts recorded.</p>}</div>}
  </main>;
}

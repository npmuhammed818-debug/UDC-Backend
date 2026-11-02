import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/button';
import { Input } from './ui/input';

type Row = Record<string, any>;
type Field = { key: string; label: string; required?: boolean; options?: string[]; multiline?: boolean; date?: boolean; omitEmpty?: boolean; maxLength?:number; minLength?:number };
const label = (value: string) => value.replaceAll('_', ' ');

export function RecordForm({ title, path, method = 'POST', fields, initial = {}, fixed = {}, onSaved, confirmation }: {
  title: string; path: string; method?: string; fields: Field[]; initial?: Row; fixed?: Row; onSaved: () => Promise<void>; confirmation?: string;
}) {
  const [values, setValues] = useState<Row>(() => Object.fromEntries(fields.map(f => [f.key, (f.date&&initial[f.key]?new Date(new Date(initial[f.key]).getTime()-new Date(initial[f.key]).getTimezoneOffset()*60000).toISOString().slice(0,16):initial[f.key]) ?? f.options?.[0] ?? ''])));
  const [confirmed,setConfirmed]=useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if(confirmation&&!confirmed)return; setBusy(true); setError(''); setSaved(false);
    try {
      const data: Row = { ...fixed };
      for (const field of fields) { if(field.omitEmpty&&!String(values[field.key]).trim())continue; data[field.key] = field.date ? (values[field.key] ? new Date(values[field.key]).toISOString() : undefined) : String(values[field.key]).trim(); }
      const response = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error('Check the details and your access, then try again.');
      await onSaved(); setSaved(true);setConfirmed(false);
      if (method === 'POST') setValues(Object.fromEntries(fields.map(f => [f.key, f.options?.[0] ?? ''])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This record could not be saved.'); }
    finally { setBusy(false); }
  };
  return <form className="mt-4 border-t border-border pt-4" onSubmit={submit}><h3>{title}</h3><div className="form-two mt-3">{fields.map(field => <label className="block text-sm" key={field.key}><span className="mb-2 block font-medium">{field.label}</span>{field.options ? <select className="select" value={values[field.key]} onChange={e => setValues({ ...values, [field.key]: e.target.value })}>{field.options.map(option => <option key={option} value={option}>{label(option)}</option>)}</select> : field.multiline ? <textarea className="textarea" required={field.required} maxLength={field.maxLength??2000} minLength={field.minLength} value={values[field.key]} onChange={e => setValues({ ...values, [field.key]: e.target.value })} /> : <Input required={field.required} type={field.date ? 'datetime-local' : 'text'} maxLength={field.maxLength??150} minLength={field.minLength} value={values[field.key]} onChange={e => setValues({ ...values, [field.key]: e.target.value })} />}</label>)}</div>{confirmation&&<label style={{display:'flex',gap:10,fontSize:12,marginTop:16}}><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{confirmation}</span></label>}<Button className="mt-3" type="submit" disabled={busy||Boolean(confirmation&&!confirmed)}>{busy ? 'Saving…' : 'Save record'}</Button>{error && <div className="error-banner mt-3" role="alert">{error}</div>}{saved && <p className="success-banner mt-3" role="status">Record saved.</p>}</form>;
}

export function DealExecutionControls({ dealId, room }: { dealId: string; room: Row }) {
  const qc = useQueryClient();
  const refresh = async () => { await Promise.all(['admin-deal-room', 'admin-inspections', 'admin-shipments', 'admin-financials', 'admin-documents'].map(key => qc.invalidateQueries({ queryKey: [key, dealId] }))); };
  return <section className="mt-5" data-testid="deal-execution-controls"><h3>Inspection, shipment and customs records</h3><p className="text-sm mt-2">Record updates confirmed with the responsible parties. Dates use your local timezone. Payment stages still require the DLC and destination SGS evidence review.</p>
    <RecordForm key={`inspection-new-${dealId}`} title="Request or schedule an inspection" path="/api/admin/inspections" fixed={{ dealId }} onSaved={refresh} fields={[{ key: 'inspectorName', label: 'Inspection provider', required: true }, { key: 'scheduledAt', label: 'Confirmed inspection time (optional)', date: true }, { key: 'resultSummary', label: 'Location and inspection instructions', multiline: true }]} />
    {(room.inspections ?? []).map((row: Row) => <RecordForm key={`inspection-${row.id}`} title={`Inspection: ${row.inspectorName || 'Provider pending'}`} path={`/api/admin/inspections/${row.id}`} method="PATCH" initial={row} onSaved={refresh} fields={[{ key: 'status', label: 'Reviewed inspection status', options: ['requested', 'scheduled', 'in_progress', 'passed', 'failed', 'cancelled'] }, { key: 'resultSummary', label: 'Reviewed result and evidence reference', multiline: true }]} />)}
    <RecordForm key={`shipment-new-${dealId}`} title="Record a shipment" path="/api/admin/shipments" fixed={{ dealId }} onSaved={refresh} fields={[{ key: 'carrier', label: 'Carrier', required: true }, { key: 'trackingNumber', label: 'Tracking or booking reference', required: true }, { key: 'origin', label: 'Loading location', required: true }, { key: 'destination', label: 'Destination', required: true }, { key: 'estimatedArrival', label: 'Estimated arrival (optional)', date: true }, { key: 'notes', label: 'Shipment notes', multiline: true }]} />
    {(room.shipments ?? []).map((row: Row) => <RecordForm key={`shipment-${row.id}`} title={`Shipment: ${row.carrier || 'Carrier pending'} · ${row.trackingNumber || 'Reference pending'}`} path={`/api/admin/shipments/${row.id}`} method="PATCH" initial={row} onSaved={refresh} fields={[{ key: 'status', label: 'Confirmed shipment status', options: ['planned', 'booked', 'in_transit', 'arrived', 'delivered', 'cancelled'] }, { key: 'notes', label: 'Update and evidence reference', multiline: true }]} />)}
    <RecordForm key={`customs-${dealId}-${room.customs?.updatedAt || 'new'}`} title="Customs clearance" path={`/api/admin/deals/${dealId}/customs`} method="PUT" initial={room.customs ?? {}} onSaved={refresh} fields={[{ key: 'status', label: 'Confirmed customs status', options: ['not_started', 'documents_pending', 'submitted', 'inspection', 'duties_pending', 'cleared', 'held'] }, { key: 'country', label: 'Country' }, { key: 'port', label: 'Port or customs office' }, { key: 'reference', label: 'Clearance reference' }, { key: 'notes', label: 'Clearance notes', multiline: true }]} />
  </section>;
}

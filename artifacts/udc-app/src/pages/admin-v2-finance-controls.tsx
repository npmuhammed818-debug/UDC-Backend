import {useActionLock} from '@/hooks/use-action-lock';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadJson, fmtStatus, type AnyRecord } from './admin-v2-data';

const instrumentStatuses=['not_started','requested','pending','received','confirmed','rejected','cancelled'];
function Field({label,children}:{label:string;children:ReactNode}) { return <label className="field"><span>{label}</span>{children}</label>; }
async function save(path:string,method:string,data:AnyRecord) {
 const response=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok) throw Error('The record could not be saved. Check the details and try again.');
}
function MoneyForm({title,children,onSave}:{title:string;children:ReactNode;onSave:()=>Promise<void>}) {
  const actionLock=useActionLock();
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!confirmed)return;if(!actionLock.acquire())return;setBusy(true);setMessage('');try{await onSave();setMessage('Saved. The audit log records this change.');setConfirmed(false);}catch(e){setMessage(e instanceof Error?e.message:'Save failed');}finally{actionLock.release();setBusy(false);}};
  return <form onSubmit={submit} className="av2-panel" style={{padding:18}}><h2>{title}</h2><div className="form-two" style={{marginTop:12}}>{children}</div>
    <label style={{marginTop:14,marginBottom:14,display:'flex',alignItems:'flex-start',gap:10,fontSize:'.75rem'}}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required style={{width:16,height:16,flexShrink:0,marginTop:2}} /><span>I checked the evidence and approve this record change. This does not move money. A status change may notify the deal parties or beneficiary.</span></label>
    <button className="av2-btn orange sm" disabled={busy || !confirmed}>{busy?'Saving…':'Save reviewed record'}</button><p role="status" className="av2-d">{message}</p></form>;
}

export function FinanceControls() {
  const qc=useQueryClient();
  const deals=useQuery({queryKey:['v2-money-deals'],queryFn:()=>loadJson<{deals:AnyRecord[]}>('/api/admin/deals')});
  const users=useQuery({queryKey:['v2-money-users'],queryFn:()=>loadJson<{users:AnyRecord[]}>('/api/admin/users')});
  const instruments=useQuery({queryKey:['v2-finance-instruments'],queryFn:()=>loadJson<{instruments:AnyRecord[]}>('/api/admin/financial-instruments')});
  const commissions=useQuery({queryKey:['v2-finance-commissions'],queryFn:()=>loadJson<{commissions:AnyRecord[]}>('/api/admin/commissions')});
  const [dealId,setDealId]=useState(''),[beneficiary,setBeneficiary]=useState('');
  const [amount,setAmount]=useState(''),[currency,setCurrency]=useState('USD'),[provider,setProvider]=useState(''),[reference,setReference]=useState('');
  const [method,setMethod]=useState('fixed_amount'),[rate,setRate]=useState(''),[commissionAmount,setCommissionAmount]=useState('');
  const [correctionMethod,setCorrectionMethod]=useState('fixed_amount'),[correctionValue,setCorrectionValue]=useState(''),[correctionReason,setCorrectionReason]=useState('');
  const [editInstrument,setEditInstrument]=useState<AnyRecord|null>(null),[editCommission,setEditCommission]=useState<AnyRecord|null>(null);
  const refresh=async()=>{await Promise.all([['v2-finance-instruments'],['v2-finance-commissions'],['v2-analytics'],['v2-audit'],['v2-activity-page']].map(queryKey=>qc.invalidateQueries({queryKey})));};
  if(deals.isError || users.isError || instruments.isError || commissions.isError)return <div className="av2-err">Finance controls did not load. <button onClick={()=>{void deals.refetch();void users.refetch();void instruments.refetch();void commissions.refetch();}}>Retry</button></div>;
  if(deals.isLoading || users.isLoading || instruments.isLoading || commissions.isLoading)return <div className="av2-skel" />;
  const selectedDeal=deals.data?.deals.find(d=>d.id===dealId);
  const dealSelect=<Field label="Deal"><select className="select" value={dealId} required onChange={e=>{setDealId(e.target.value);const d=deals.data?.deals.find(x=>x.id===e.target.value);setCurrency(d?.currency || 'USD');}}><option value="">Choose a deal</option>{deals.data?.deals.map(d=><option key={d.id} value={d.id}>{d.dealNumber || d.id}</option>)}</select></Field>;
  return <section data-testid="v2-finance-controls">
    <h2 style={{margin:'24px 0 12px'}}>Human-admin controls</h2><p className="av2-d">Record only agreed terms and verified evidence. AKIF cannot submit these forms. No bank payment is made here.</p>
    <MoneyForm title="Record a DLC" onSave={async()=>{await save('/api/admin/financial-instruments','POST',{dealId,instrumentType:'DLC',...(amount?{amount}:{}),currency,provider,reference});await refresh();}}>
      {dealSelect}<Field label="Amount (optional)"><input className="select" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} /></Field>
      <Field label="Currency"><input className="select" required minLength={3} maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} /></Field>
      <Field label="Issuing bank / provider"><input className="select" maxLength={160} value={provider} onChange={e=>setProvider(e.target.value)} /></Field><Field label="Reference"><input className="select" maxLength={160} value={reference} onChange={e=>setReference(e.target.value)} /></Field>
    </MoneyForm>
    <div className="av2-panel" style={{padding:18}}><h2>Edit a DLC record</h2><select className="select" value={editInstrument?.id || ''} onChange={e=>setEditInstrument(instruments.data?.instruments.find(x=>x.id===e.target.value) || null)}><option value="">Choose a recorded DLC</option>{instruments.data?.instruments.map(x=><option key={x.id} value={x.id}>{deals.data?.deals.find(d=>d.id===x.dealId)?.dealNumber || x.dealId} · {x.reference || x.id} · {fmtStatus(x.status)}</option>)}</select></div>
    {editInstrument && <MoneyForm key={editInstrument.id} title="Reviewed DLC status" onSave={async()=>{await save(`/api/admin/financial-instruments/${editInstrument.id}`,'PATCH',{status:editInstrument.status,reference:editInstrument.reference || '',provider:editInstrument.provider || ''});await refresh();}}>
      <Field label="Status"><select className="select" value={editInstrument.status} onChange={e=>setEditInstrument({...editInstrument,status:e.target.value})}>{instrumentStatuses.map(s=><option key={s}>{s}</option>)}</select></Field>
      <Field label="Provider"><input className="select" maxLength={160} value={editInstrument.provider || ''} onChange={e=>setEditInstrument({...editInstrument,provider:e.target.value})} /></Field><Field label="Reference"><input className="select" maxLength={160} value={editInstrument.reference || ''} onChange={e=>setEditInstrument({...editInstrument,reference:e.target.value})} /></Field>
    </MoneyForm>}
    <MoneyForm title="Record agreed commission" onSave={async()=>{await save('/api/admin/commissions','POST',{dealId,beneficiaryUserId:beneficiary,commissionType:method,currency,confirmAgreedTerms:true,...(method==='fixed_amount'?{amount:commissionAmount}:{commissionRate:rate})});await refresh();}}>
      {dealSelect}<Field label="Beneficiary"><select className="select" required value={beneficiary} onChange={e=>setBeneficiary(e.target.value)}><option value="">Choose a beneficiary</option>{users.data?.users.map(u=><option key={u.id} value={u.id}>{u.fullName || u.email} · {u.role}</option>)}</select></Field>
      <Field label="Agreed calculation"><select className="select" value={method} onChange={e=>setMethod(e.target.value)}><option value="fixed_amount">Fixed amount</option><option value="percentage">Percentage</option><option value="fixed_per_mt">Amount per MT</option></select></Field>
      <Field label={method==='fixed_amount'?'Agreed amount':'Agreed rate'}><input className="select" required type="number" min="0.0001" step="0.0001" value={method==='fixed_amount'?commissionAmount:rate} onChange={e=>method==='fixed_amount'?setCommissionAmount(e.target.value):setRate(e.target.value)} /></Field>
      <Field label="Currency"><input className="select" required minLength={3} maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} /></Field>
      <p className="av2-d">{selectedDeal ? `Deal currency: ${selectedDeal.currency}. Calculated commissions use that currency.`:'Choose a deal first.'} No default rate is assumed.</p>
    </MoneyForm>
    <div className="av2-panel" style={{padding:18}}><h2>Update commission status</h2><select className="select" value={editCommission?.id || ''} onChange={e=>{setEditCommission(commissions.data?.commissions.find(x=>x.id===e.target.value) || null);setCorrectionValue('');setCorrectionReason('');}}><option value="">Choose a commission</option>{commissions.data?.commissions.map(x=><option key={x.id} value={x.id}>{x.currency} {x.amount} · {fmtStatus(x.status)} · {deals.data?.deals.find(d=>d.id===x.dealId)?.dealNumber || x.dealId}</option>)}</select><p className="av2-d">Only pending amounts can be corrected below. Paid and cancelled records stay unchanged. Currency, beneficiary and deal cannot be reassigned. Do not cancel and recreate an agent commission: duplicate agent rewards are blocked.</p></div>
    {editCommission?.status==='pending'&&<MoneyForm key={`terms-${editCommission.id}`} title="Correct pending commission terms" onSave={async()=>{await save(`/api/admin/commissions/${editCommission.id}/terms`,'PATCH',{commissionType:correctionMethod,expectedAmount:editCommission.amount,reason:correctionReason,confirmAgreedTerms:true,...(correctionMethod==='fixed_amount'?{amount:correctionValue}:{commissionRate:correctionValue})});await refresh();setEditCommission(null);}}>
      <p className="av2-d">Current saved amount: {editCommission.currency} {editCommission.amount}. This replaces pending terms and sends an in-app notice to the beneficiary. The audit keeps the old and new terms plus your reason. No payment is made.</p>
      <Field label="Correct agreed method"><select className="select" value={correctionMethod} onChange={e=>{setCorrectionMethod(e.target.value);setCorrectionValue('');}}><option value="fixed_amount">Fixed amount</option><option value="percentage">Percentage</option><option value="fixed_per_mt">Amount per MT</option></select></Field>
      <Field label={correctionMethod==='fixed_amount'?'Correct agreed amount':'Correct agreed rate'}><input className="select" required type="number" min="0.0001" step="0.0001" value={correctionValue} onChange={e=>setCorrectionValue(e.target.value)}/></Field>
      <Field label="Evidence and reason for correction"><textarea className="textarea" required minLength={12} maxLength={1000} value={correctionReason} onChange={e=>setCorrectionReason(e.target.value)}/></Field>
    </MoneyForm>}
    {editCommission && <MoneyForm key={editCommission.id} title="Reviewed commission status" onSave={async()=>{await save(`/api/admin/commissions/${editCommission.id}/status`,'PATCH',{status:editCommission.status});await refresh();}}>
      <Field label="Status"><select className="select" value={editCommission.status} onChange={e=>setEditCommission({...editCommission,status:e.target.value})}>{['pending','paid','cancelled'].map(s=><option key={s}>{s}</option>)}</select></Field><p className="av2-d">Paid is allowed only after deal completion. Paid/cancelled may send the beneficiary a WhatsApp notice. This records a payment already confirmed, it does not pay them.</p>
    </MoneyForm>}
  </section>;
}

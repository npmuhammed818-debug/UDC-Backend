import {useState,type FormEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {loadJson,type AnyRecord} from './admin-v2-data';
export function IncidentControls(){
 const incidents=useQuery({queryKey:['v2-incidents'],queryFn:()=>loadJson<{incidents:AnyRecord[]}>('/api/admin/incidents')});
 const users=useQuery({queryKey:['v2-incident-users'],queryFn:()=>loadJson<{users:AnyRecord[]}>('/api/admin/users')});
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[severity,setSeverity]=useState('low'),[categories,setCategories]=useState(''),[affected,setAffected]=useState<string[]>([]);
 const [incidentId,setIncidentId]=useState(''),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const submit=async(event:FormEvent,notify=false)=>{event.preventDefault();if(notify&&!confirmed)return;setBusy(true);setMessage('');try{
  const response=await fetch(notify?`/api/admin/incidents/${incidentId}/notify`:'/api/admin/incidents',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(notify?{message:notice}:{title,description,severity,dataCategories:categories.split(',').map(x=>x.trim()).filter(Boolean),affectedUserIds:affected})});
  const result=await response.json();if(!response.ok)throw Error(String(result.error || 'Save failed').replaceAll('_',' '));
  await incidents.refetch();setMessage(notify?`Recorded ${result.notified} in-app notices. WhatsApp and email were not sent.`:'Incident recorded in the audit log. No notices sent.');setConfirmed(false);
 }catch(e){setMessage(e instanceof Error?e.message:'Save failed');}finally{setBusy(false);}};
 const selected=incidents.data?.incidents.find(i=>i.id===incidentId);
 return <section data-testid="v2-incident-controls"><p role="status" className="av2-d">{message}</p>
  <form className="av2-panel" style={{padding:18}} onSubmit={e=>void submit(e)}><h2>Record an incident</h2><p className="av2-d">Log verified facts, not secrets or raw identity documents. This does not send notices.</p>
   <label className="field"><span>Title</span><input className="select" required minLength={3} maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <label className="field"><span>Facts and action taken</span><textarea className="textarea" required minLength={10} maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
   <label className="field"><span>Severity</span><select className="select" value={severity} onChange={e=>setSeverity(e.target.value)}>{['low','medium','high'].map(s=><option key={s}>{s}</option>)}</select></label>
   <label className="field"><span>Data categories (comma separated, up to 20)</span><input className="select" maxLength={1600} value={categories} onChange={e=>setCategories(e.target.value)}/></label>
   <label className="field"><span>Affected accounts (optional, select multiple)</span><select multiple className="select" value={affected} onChange={e=>setAffected([...e.target.selectedOptions].map(x=>x.value))}>{users.data?.users.map(u=><option key={u.id} value={u.id}>{u.fullName || u.email} · {u.role}</option>)}</select></label>
   {users.isError&&<p role="alert">Account list did not load. <button type="button" onClick={()=>void users.refetch()}>Retry</button></p>}
   <button className="av2-btn orange sm" disabled={busy}>Record incident</button>
  </form>
  <form className="av2-panel" style={{padding:18}} onSubmit={e=>void submit(e,true)}><h2>Reviewed in-app incident notice</h2><p className="av2-d">Only the recorded affected accounts receive this wording, plus the support contact. This is an in-app notice, not WhatsApp or email. Check recipients and wording before sending.</p>
   <label className="field"><span>Recorded incident</span><select required className="select" value={incidentId} onChange={e=>{setIncidentId(e.target.value);setConfirmed(false);}}><option value="">Choose an incident</option>{incidents.data?.incidents.map(i=><option key={i.id} value={i.id}>{i.title} · {i.affectedCount} affected · {i.notifiedCount} notices already recorded</option>)}</select></label>
   {selected && <div className="av2-d">Recipients: {(selected.affectedUserIds || []).map((id:string)=>users.data?.users.find(u=>u.id===id)?.fullName || id).join(', ') || 'None recorded'}</div>}
   <label className="field"><span>Exact notice</span><textarea className="textarea" required minLength={20} maxLength={1500} value={notice} onChange={e=>{setNotice(e.target.value);setConfirmed(false);}}/></label>
   <label style={{display:'flex',gap:10,fontSize:12,marginBottom:16}}><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I checked this incident's affected accounts and approve the notice. Sending again creates another notice.</span></label>
   <button className="av2-btn orange sm" disabled={busy||!confirmed||!incidentId}>Send reviewed in-app notice</button>
  </form>
 </section>;
}

import {useState,type FormEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AdminV2Gate,AdminV2Shell} from './admin-v2-shell';
import {loadJson,fmtStatus,type AnyRecord} from './admin-v2-data';
import {IncidentControls} from './admin-v2-incidents';
import {AdminPrivacyRequests} from '../components/privacy';
function Support({user}:{user:AnyRecord}){
 const grievances=useQuery({queryKey:['v2-grievances'],queryFn:()=>loadJson<{grievances:AnyRecord[]}>('/api/admin/grievances')});
 const incidents=useQuery({queryKey:['v2-incidents'],queryFn:()=>loadJson<{incidents:AnyRecord[]}>('/api/admin/incidents')});
 const [notes,setNotes]=useState<Record<string,string>>({}),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
 const review=async(event:FormEvent,id:string)=>{event.preventDefault();setBusy(id);setMessage('');const form=new FormData(event.currentTarget as HTMLFormElement);try{
  const response=await fetch(`/api/admin/grievances/${id}/update`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:form.get('status'),note:notes[id]})});if(!response.ok)throw Error('Review could not be saved.');await grievances.refetch();setMessage('Review recorded in the audit log. No message was sent.');
 }catch(e){setMessage(e instanceof Error?e.message:'Review failed');}finally{setBusy('');}};
 return <AdminV2Shell user={user} active="support" title="Privacy and support" sub="Privacy requests, complaints and recorded incidents">
  <h1 className="av2-h1">Requests that need a human</h1><div className="av2-embed" style={{marginTop:18}}><AdminPrivacyRequests/></div>
  <p role="status" className="av2-d">{message}</p>
  <section className="av2-panel" style={{padding:18,marginTop:18}}><h2>Grievances</h2><p className="av2-d">A review records the response status. It does not contact the person or erase their data.</p>
  {grievances.isError?<p role="alert">Complaints did not load. <button onClick={()=>void grievances.refetch()}>Retry</button></p>:grievances.isLoading?<div className="av2-skel"/>:!grievances.data?.grievances.length?<p className="av2-d">No grievances recorded.</p>:grievances.data.grievances.map(g=><form key={g.id} onSubmit={event=>void review(event,g.id)} style={{borderTop:'1px solid #ddd',padding:'16px 0'}}><p>{g.text}</p><p className="av2-d">{fmtStatus(g.status)} · received {new Date(g.receivedAt).toLocaleString()} · due {new Date(g.dueAt).toLocaleString()}</p><label className="field"><span>Review status</span><select name="status" className="select"><option value="responded">Responded</option><option value="resolved">Resolved</option></select></label><label className="field"><span>Evidence and outcome</span><textarea className="textarea" required minLength={1} maxLength={1000} value={notes[g.id]||''} onChange={e=>setNotes({...notes,[g.id]:e.target.value})}/></label><button className="av2-btn orange sm" disabled={!!busy}>Record human review</button></form>)}
  </section>
  <section className="av2-panel" style={{padding:18}}><h2>Incident register</h2><p className="av2-d">Review recorded incidents here. Creating an incident and sending an in-app notice are separate human actions below.</p>{incidents.isError?<p role="alert">Incidents did not load. <button onClick={()=>void incidents.refetch()}>Retry</button></p>:incidents.isLoading?<div className="av2-skel"/>:!incidents.data?.incidents.length?<p className="av2-d">No incidents recorded.</p>:incidents.data.incidents.map(i=><article key={i.id} style={{padding:'12px 0',borderTop:'1px solid #ddd'}}><h3>{i.title}</h3><p className="av2-d">{i.severity} · {i.affectedCount} affected · {i.notifiedCount} notices recorded</p><p>{(i.dataCategories || []).join(', ')}</p></article>)}</section>
 <IncidentControls/>
 </AdminV2Shell>;
}
export function AdminV2SupportPage(){return <AdminV2Gate>{user=><Support user={user}/>}</AdminV2Gate>;}

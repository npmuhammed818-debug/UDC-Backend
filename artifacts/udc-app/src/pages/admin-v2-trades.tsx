import { useState } from 'react';
import { useAdminV2Data, fmtStatus, type AnyRecord } from './admin-v2-data';
import { AdminV2Gate, AdminV2Shell } from './admin-v2-shell';

const fields=['productId','quantity','unit','targetPrice','price','currency','destination','originCountry','incoterm','specification','deliveryTime','contractDuration','inspectionRequirements','paymentTerms','status','createdAt'];
function TradeRecords({user}:{user:AnyRecord}) {
 const data=useAdminV2Data(); const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const [review,setReview]=useState<{kind:string;id:string;status:string}|null>(null);
 const submit=async()=>{if(!review)return;setBusy(review.id);setError('');try{
  const response=await fetch(`/api/admin/${review.kind}/${review.id}/status`,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:review.status})});
  if(!response.ok)throw Error('Review could not be saved.');await data.refreshAll();setReview(null);
 }catch(e){setError(e instanceof Error?e.message:'Review failed');}finally{setBusy('');}};
 return <AdminV2Shell user={user} active="trades" title="Trade submissions" sub="Full submitted buyer requirements and seller offers">
  <h1 className="av2-h1">Trade submissions waiting for review</h1><p className="av2-d">Read all submitted terms before approving. Approval does not create a deal or accept the other party's terms.</p>
  {error&&<p role="alert" className="av2-err">{error}</p>}
  {review&&<div className="av2-panel" style={{padding:18}} role="dialog" aria-label="Confirm trade review"><p>Record {review.status} for this submission? The owner will receive a review notification. This change is audited.</p><button className="av2-btn orange sm" disabled={!!busy} onClick={()=>void submit()}>Confirm review</button> <button className="av2-btn ghost sm" onClick={()=>setReview(null)}>Cancel</button></div>}
  {([['buyer-requests','Buyer requirements',data.buyers,'requirements','buyer'],['seller-offers','Seller offers',data.sellers,'offers','seller']] as const).map(([kind,title,query,root,prefix])=><section key={kind} className="av2-panel" style={{padding:18,marginTop:18}}><h2>{title}</h2>
   {query.isError?<p role="alert">Submissions did not load. <button onClick={()=>void query.refetch()}>Retry</button></p>:query.isLoading?<div className="av2-skel"/>:!((query.data as AnyRecord)?.[root]??[]).length?<p className="av2-d">Nothing waiting.</p>:((query.data as AnyRecord)[root] as AnyRecord[]).map(item=><article key={item.id} id={`${prefix}-${item.id}`} style={{borderTop:'1px solid #ddd',padding:'16px 0'}}>
    <h3>{item.quantity} {item.unit} · {item.destination || item.originCountry || 'Location not stated'}</h3><dl>{[...new Set([...fields,...Object.keys(item)])].filter(f=>item[f]!==undefined&&item[f]!==null&&item[f]!=='').map(f=><div key={f} style={{padding:'5px 0',overflowWrap:'anywhere'}}><dt className="av2-micro2">{fmtStatus(f.replace(/[A-Z]/g,c=>' '+c.toLowerCase()))}</dt><dd className="av2-d">{typeof item[f]==='object'?JSON.stringify(item[f]):String(item[f])}</dd></div>)}</dl>
    <div className="av2-r2"><button className="av2-btn orange sm" disabled={!!busy} onClick={()=>setReview({kind,id:item.id,status:'approved'})}>Approve</button><button className="av2-btn ghost sm" disabled={!!busy} onClick={()=>setReview({kind,id:item.id,status:'rejected'})}>Reject</button></div>
   </article>)}
  </section>)}
 </AdminV2Shell>;
}
export function AdminV2TradesPage(){return <AdminV2Gate>{user=><TradeRecords user={user}/>}</AdminV2Gate>;}

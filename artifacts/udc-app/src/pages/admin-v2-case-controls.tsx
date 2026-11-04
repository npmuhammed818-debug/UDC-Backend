import {useQueryClient} from '@tanstack/react-query';
import {RecordForm} from '../components/deal-execution-controls';
import {type AnyRecord} from './admin-v2-data';
export function CaseControls({dealId,room}:{dealId:string;room:AnyRecord}){
 const qc=useQueryClient();const refresh=async()=>{await qc.invalidateQueries({queryKey:['v2-chat-room',dealId]});};
 return <section className="av2-embed" style={{padding:18}} data-testid="v2-case-controls"><h2>Human case review</h2><p className="av2-d">Opening a case notifies the deal parties. Review facts and evidence before saving. Updates and evidence are audited. Resolving a case does not move money or settle a legal dispute.</p>
 <RecordForm confirmation="I reviewed these facts and approve opening the case and notifying the deal parties." title="Open a deal case" path={`/api/admin/deals/${dealId}/cases`} onSaved={refresh} fields={[{key:'caseType',label:'Case type',options:['trade_issue','document','inspection','shipment','payment','compliance']},{key:'priority',label:'Priority',options:['low','normal','high','critical']},{key:'summary',label:'Reviewed facts',required:true,multiline:true}]}/>
 {(room.cases || []).map((c:AnyRecord)=><article key={c.id} style={{borderTop:'1px solid #ddd',marginTop:18}}><h3>{c.summary}</h3><p className="av2-d">{c.caseType} · {c.priority} · {c.status}</p><p>{c.resolution}</p>
 <RecordForm confirmation="I approve this case status and resolution record." title="Review case status" path={`/api/admin/cases/${c.id}`} method="PATCH" initial={c} onSaved={refresh} fields={[{key:'status',label:'Reviewed status',options:['open','investigating','waiting_party','resolved','closed']},{key:'resolution',label:'Resolution evidence (required to close)',multiline:true}]}/>
 <RecordForm confirmation="I checked this evidence and approve adding it to the case." title="Add case evidence" path={`/api/admin/cases/${c.id}/evidence`} onSaved={refresh} fields={[{key:'note',label:'Evidence note',multiline:true,required:true}]}/>
 {(c.evidence || []).map((e:AnyRecord,i:number)=><p key={i} className="av2-d">{e.note || 'Document evidence'}{e.documentId?` · document ${e.documentId}`:''} · {e.addedAt}</p>)}
 </article>)}
 </section>;
}

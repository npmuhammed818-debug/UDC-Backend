import { and, desc, eq, sql } from 'drizzle-orm';
import { auditLogsTable, db } from '@workspace/db';
import { flowDefinitions, type FlowKind } from './flowDefinitions';

export async function publishedFlowId(kind:FlowKind){
  const [row]=await db.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'whatsapp_flow_published'),sql`${auditLogsTable.metadata}->>'kind' = ${kind}`)).orderBy(desc(auditLogsTable.createdAt)).limit(1);
  const id=(row?.metadata as Record<string,unknown>|undefined)?.flowId;
  return typeof id==='string'&&/^\d+$/.test(id)?id:null;
}

export async function provisionChatFlows(){
  const accessToken=process.env.WHATSAPP_ACCESS_TOKEN?.trim(),waba=process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if(!accessToken||!waba)return {status:'blocked',reason:'waba_credentials_missing'};
  const graph=async(path:string,body?:FormData|URLSearchParams)=>{
    const r=await fetch('https://graph.facebook.com/v21.0/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+accessToken},...(body?{body}:{}),signal:AbortSignal.timeout(20_000)});
    const json:any=await r.json().catch(()=>null);
    if(!r.ok)throw new Error('meta_flow_http_'+r.status+'_code_'+(typeof json?.error?.code==='number'?json.error.code:'unknown'));
    return json;
  };
  const existing=await graph(encodeURIComponent(waba)+'/flows?fields=id,name,status&limit=100');
  const results=[];
  for(const [kind,definition] of Object.entries(flowDefinitions)){
    let flow=existing?.data?.find((item:any)=>item.name===definition.name);
    if(!flow){const created=await graph(encodeURIComponent(waba)+'/flows',new URLSearchParams({name:definition.name,categories:JSON.stringify(['OTHER'])}));if(!/^\d+$/.test(created?.id))throw new Error('meta_flow_id_missing');flow={id:created.id,status:'DRAFT'};}
    if(!/^\d+$/.test(flow.id))throw new Error('meta_flow_id_invalid');
    if(flow.status!=='PUBLISHED'){
      if(flow.status!=='DRAFT')throw new Error('meta_flow_not_publishable');
      const asset=new FormData();asset.set('name','flow.json');asset.set('asset_type','FLOW_JSON');asset.set('file',new Blob([JSON.stringify(definition.json)],{type:'application/json'}),'flow.json');
      const uploaded=await graph(flow.id+'/assets',asset);
      if(uploaded.success!==true || (Array.isArray(uploaded.validation_errors)&&uploaded.validation_errors.length)){
        await db.insert(auditLogsTable).values({action:'whatsapp_flow_validation_failed',entityType:'whatsapp_flow',metadata:{kind,errors:Array.isArray(uploaded.validation_errors)?uploaded.validation_errors.slice(0,12).map((e:any)=>({error:String(e.error??'').slice(0,300),type:String(e.error_type??'').slice(0,60),line:typeof e.line_start==='number'?e.line_start:null})):[]}});
        throw new Error('meta_flow_schema_rejected_'+kind);
      }
      const published=await graph(flow.id+'/publish',new URLSearchParams());
      if(published.success!==true)throw new Error('meta_flow_publish_failed_'+kind);
    }
    const verified=await graph(flow.id+'?fields=id,status');
    if(verified.status!=='PUBLISHED')throw new Error('meta_flow_not_published_'+kind);
    await db.insert(auditLogsTable).values({action:'whatsapp_flow_published',entityType:'whatsapp_flow',metadata:{kind,flowId:flow.id,status:'PUBLISHED'}});
    results.push({kind,status:'published'});
  }
  return {status:'ready',results};
}

export function startChatFlowSetup(log:{info:(v:unknown,msg:string)=>void;error:(v:unknown,msg:string)=>void}){
  const runId=process.env.UDC_WHATSAPP_FLOWS_SETUP_RUN_ID;
  if(!runId||! /^[A-Za-z0-9_-]{8,80}$/.test(runId))return;
  void (async()=>{
    const claim=await db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'chat_flow_setup:'+runId}))`);
      const [seen]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'whatsapp_flow_setup_started'),sql`${auditLogsTable.metadata}->>'runId' = ${runId}`)).limit(1);
      if(seen)return false;
      await tx.insert(auditLogsTable).values({action:'whatsapp_flow_setup_started',entityType:'whatsapp_flow',metadata:{runId}});return true;
    });
    if(!claim)return;
    try{const result=await provisionChatFlows();await db.insert(auditLogsTable).values({action:'whatsapp_flow_setup_completed',entityType:'whatsapp_flow',metadata:{runId,...result}});log.info({runId,...result},'WhatsApp interactive forms setup completed');}
    catch(error){const raw=error instanceof Error?error.message:'';const reason=/^(meta_flow_[a-z0-9_]+)$/.test(raw)?raw:'flow_setup_unavailable';await db.insert(auditLogsTable).values({action:'whatsapp_flow_setup_completed',entityType:'whatsapp_flow',metadata:{runId,status:'blocked',reason}});log.error({runId,reason},'WhatsApp interactive forms setup blocked');}
  })().catch(()=>log.error({reason:'flow_setup_audit_unavailable'},'WhatsApp interactive forms setup blocked'));
}

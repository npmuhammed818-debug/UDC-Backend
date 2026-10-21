import { extractParagraph } from './paragraphIntake';
import { createHmac, randomUUID } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db, whatsappChatSessionsTable as sessions } from '@workspace/db';
import { z } from 'zod/v4';
import { issueFlowToken, type FlowPurpose } from './flowToken';
import { businessEmail } from './registrationEmail';
import { sendWhatsAppInteractive, sendWhatsAppText } from './client';

type Question={name:string;label:string;optional?:boolean;kind?:'email'|'positive'|'incoterm';max?:number};
const q=(name:string,label:string,options:Omit<Question,'name'|'label'>={}):Question=>({name,label,...options});
export function guidedQuestions(purpose:FlowPurpose):Question[]{
  if(purpose.startsWith('profile_'))return [q('full_name','What is your full name?'),q('email',purpose==='profile_agent'?'What email should UDC use? Personal or business email is fine.':'What is your company email?',{kind:'email',max:254}),...(purpose==='profile_agent'?[]:[q('company_name','What is your registered company name?',{max:200}),q('country','In which country is your company registered?'),q('registration_number','What is your company registration number?',{optional:true,max:100})])];
  if(purpose==='buyer')return [q('product','What product do you need?'),q('quantity','How many metric tonnes (MT) do you need?',{kind:'positive'}),q('specification','What grade or specification do you need?',{optional:true,max:2000}),q('destination','What is the destination port?'),q('incoterm','Which incoterm: EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU or DDP?',{kind:'incoterm'}),q('target_price','What is your target price in USD per MT?',{kind:'positive',optional:true}),q('delivery_time','When do you need delivery?',{optional:true,max:500}),q('payment_terms','What payment terms do you prefer?',{optional:true,max:2000})];
  return [q('product','What product can you supply?'),q('quantity','What quantity can you supply?',{kind:'positive'}),q('unit','What unit is that quantity and price based on? (for example, MT, kg or pieces)',{max:24}),q('specification','What grade or specification can you supply?',{optional:true,max:2000}),q('price','What price are you offering?',{kind:'positive'}),q('currency','What currency is that price in? (for example, USD, AED or EUR)',{max:3}),q('origin','What is the origin country?'),q('incoterm','Which incoterm: EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU or DDP?',{kind:'incoterm'}),q('availability','When is the product available for delivery?',{optional:true,max:500}),q('destination','What is the delivery port or named place? You can skip it if the buyer will choose the destination.',{optional:true,max:120}),q('payment_terms','What payment terms do you propose?',{optional:true,max:2000})];
}
function phoneHash(phone:string){const key=process.env.WHATSAPP_APP_SECRET;if(!key||key.length<16)throw new Error('chat_draft_signing_unavailable');return createHmac('sha256',key).update('UDC_GUIDED_CHAT_V1\0'+phone).digest('hex');}
const expiry=()=>new Date(Date.now()+30*60_000);
async function question(phone:string,purpose:FlowPurpose,step:number,data:Record<string,string>={}){
  if(data.__paragraph==='1'){
    if(purpose==='seller'&&data.__started!=='1'){await sendWhatsAppText(phone,'Tell me about your offer in your own words. Share whatever details you have; I’ll keep them and ask one question at a time for anything needed.');return;}
    const next=guidedQuestions(purpose).find(item=>!item.optional&&!data[item.name]);
    if(next){await sendWhatsAppText(phone,next.label);return;}
    const labels=guidedQuestions(purpose).filter(q=>!q.optional&&!data[q.name]).map(q=>q.label);
    if(!labels.length){await sendWhatsAppText(phone,'Send just the details you want to change in one short message. I will keep the rest of your saved details.');return;}
    await sendWhatsAppText(phone,`Send ${labels.join(', ')} together in one short message.${purpose.startsWith('profile_')?'':' You can include grade, timing, payment terms and the delivery place too.'}`);return;
  }
  const current=guidedQuestions(purpose)[step];await sendWhatsAppText(phone,current.label+(current.optional?' Reply Skip to leave it blank.':''));
}
export async function clearGuidedChat(phone:string){const fingerprint=phoneHash(phone);await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'guided_chat:'+fingerprint}))`);await tx.delete(sessions).where(eq(sessions.phoneHash,fingerprint));});}
export async function startGuidedChat(phone:string,purpose:FlowPurpose,initial:Record<string,string>={}){
  await db.delete(sessions).where(lt(sessions.expiresAt,new Date()));
  const input={id:randomUUID(),phoneHash:phoneHash(phone),purpose,step:0,data:{...initial,__paragraph:'1'},lastMessageId:null,expiresAt:expiry(),updatedAt:new Date()};
  await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'guided_chat:'+input.phoneHash}))`);await tx.insert(sessions).values(input).onConflictDoUpdate({target:sessions.phoneHash,set:input});});
  await question(phone,purpose,0,input.data);
}

let cleanupStarted=false;
export function startGuidedDraftCleanup(){
  if(cleanupStarted)return;cleanupStarted=true;
  const cleanup=()=>{void db.delete(sessions).where(lt(sessions.expiresAt,new Date())).catch(()=>undefined);};
  cleanup();const timer=setInterval(cleanup,15*60_000);timer.unref();
}
function validate(question:Question,text:string,purpose:FlowPurpose){
  if(question.optional&&/^skip$/i.test(text))return '';
  if(text.length<1||text.length>(question.max??120))throw new Error('Please keep this answer within '+(question.max??120)+' characters.');
  if(question.kind==='email'){
    const email=z.string().email().parse(text).toLowerCase();
    if(purpose!=='profile_agent'&&!businessEmail(email))throw new Error('Use your company email. Personal email is available for agents.');return email;
  }
  if(question.kind==='positive'){
    if(! /^\d+(?:\.\d+)?$/.test(text)||!Number.isFinite(Number(text))||Number(text)<=0)throw new Error('Send a positive number only, for example 100 or 5900.50.');return text;
  }
  if(question.name==='currency'){
    if(!/^[A-Za-z]{3}$/.test(text))throw new Error('Send the three-letter currency code, for example USD, AED or EUR.');return text.toUpperCase();
  }
  if(question.kind==='incoterm'){const term=text.toUpperCase();if(!['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'].includes(term))throw new Error('Choose EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU or DDP.');return term;}
  if(question.name==='full_name'&&text.length<2)throw new Error('Please send your full name.');return text;
}
async function review(phone:string,purpose:FlowPurpose,data:Record<string,string>){
  const label:Record<string,string>={full_name:'Name',email:'Email',company_name:'Company',country:'Country',registration_number:'Registration number',product:'Product',quantity:'Quantity',unit:'Unit / price basis',currency:'Currency',specification:'Grade/specification',destination:'Destination',incoterm:'Incoterm',target_price:'Target USD/MT',price:'Price',origin:'Origin',delivery_time:'Delivery',availability:'Availability',payment_terms:'Proposed payment terms'};
  const summary=Object.entries(data).filter(([k,v])=>v&&!k.startsWith('__')).map(([key,value])=>`${label[key]??key}: ${value}`).join('\n');
  await sendWhatsAppText(phone,'Please review:\n'+summary+(purpose.startsWith('profile_')?'\nRegistration needs UDC approval.':'\nUDC recommends DLC directly to seller, after SGS at destination. Other terms require explicit buyer agreement. Submission needs UDC review.'));
  try{await sendWhatsAppInteractive(phone,{type:'button',body:{text:'Are these details correct?'},action:{buttons:[['submit','Submit for review'],['restart','Edit details'],['cancel','Cancel']].map(([id,title])=>({type:'reply' as const,reply:{id:'udc:'+id,title}}))}});}catch{await sendWhatsAppText(phone,'Reply Submit to send for UDC review, Edit to start again, or Cancel.');}
}
export async function continueGuidedChat(phone:string,message:{id?:string;text?:{body?:string}},action:string|null,submit:(phone:string,raw:string)=>Promise<string>){
  const raw=message.text?.body?.trim();
  if(!raw&&!['submit','restart','cancel'].includes(action??''))return false;
  const fingerprint=phoneHash(phone);
  const [snapshot]=await db.select().from(sessions).where(eq(sessions.phoneHash,fingerprint)).limit(1);
  if(snapshot&&message.id&&snapshot.lastMessageId===message.id)return true;
  const extracted=snapshot&&snapshot.expiresAt>new Date()&&snapshot.data.__paragraph==='1'&&snapshot.step<guidedQuestions(snapshot.purpose as FlowPurpose).length&&raw&&!action&&!/^(?:cancel|stop|edit)$/i.test(raw)
    ? await extractParagraph(snapshot.purpose as FlowPurpose,raw):null;
  const result=await db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'guided_chat:'+fingerprint}))`);
    const [session]=await tx.select().from(sessions).where(eq(sessions.phoneHash,fingerprint)).limit(1);
    if(!session)return null;
    if(session.expiresAt<new Date()){await tx.delete(sessions).where(eq(sessions.id,session.id));return {kind:'expired' as const};}
    if(message.id&&session.lastMessageId===message.id)return {kind:'duplicate' as const};
    const purpose=session.purpose as FlowPurpose;
    if(!['profile_buyer','profile_seller','profile_agent','buyer','seller'].includes(purpose)){await tx.delete(sessions).where(eq(sessions.id,session.id));return {kind:'expired' as const};}
    if(action==='cancel'||/^(?:cancel|stop)$/i.test(raw??'')){await tx.delete(sessions).where(eq(sessions.id,session.id));return {kind:'cancelled' as const};}
    if(action==='restart'||/^edit$/i.test(raw??'')){const data=session.data.__paragraph==='1'?{...session.data}:{__paragraph:'1'};await tx.update(sessions).set({step:0,data,lastMessageId:message.id,expiresAt:expiry()}).where(eq(sessions.id,session.id));return {kind:'question' as const,purpose,step:0,data};}
    const questions=guidedQuestions(purpose);
    if(session.step>=questions.length){
      if(action==='submit'||/^submit$/i.test(raw??''))return {kind:'submit' as const,purpose,id:session.id,data:session.data};
      return {kind:'review' as const,purpose,data:session.data};
    }
    if(session.data.__paragraph==='1'){
      // A concurrent edit/menu must never apply extraction to a different draft.
      if(!snapshot||snapshot.id!==session.id||snapshot.step!==session.step||JSON.stringify(snapshot.data)!==JSON.stringify(session.data))return {kind:'question' as const,purpose,step:session.step,data:session.data};
      const data:Record<string,string>={...session.data,__started:'1'};
      for(const item of questions){const candidate=extracted?.[item.name];if(candidate!==undefined){try{data[item.name]=validate(item,candidate,purpose);}catch{/* Ask only for invalid or missing details. */}}}
      const complete=questions.every(q=>q.optional||data[q.name]);
      const step=complete?questions.length:0;
      await tx.update(sessions).set({data,step,lastMessageId:message.id,expiresAt:expiry(),updatedAt:new Date()}).where(eq(sessions.id,session.id));
      return complete?{kind:'review' as const,purpose,data}:{kind:'question' as const,purpose,step,data};
    }
    if(!raw)return {kind:'question' as const,purpose,step:session.step};
    let answer:string;
    try{answer=validate(questions[session.step],raw,purpose);}catch(error){return {kind:'invalid' as const,text:error instanceof z.ZodError?'Send a valid email address.':error instanceof Error?error.message:'Please check that answer.',purpose,step:session.step};}
    const data={...session.data,[questions[session.step].name]:answer},step=session.step+1;
    await tx.update(sessions).set({data,step,lastMessageId:message.id,expiresAt:expiry(),updatedAt:new Date()}).where(eq(sessions.id,session.id));
    return step===questions.length?{kind:'review' as const,purpose,data}:{kind:'question' as const,purpose,step};
  });
  if(!result)return false;
  switch(result.kind){
    case 'duplicate':return true;
    case 'expired':await sendWhatsAppText(phone,'That draft expired. Type Menu to start again.');return true;
    case 'cancelled':await sendWhatsAppText(phone,'Cancelled. Nothing was submitted. Type Menu for your features.');return true;
    case 'invalid':await sendWhatsAppText(phone,result.text);await question(phone,result.purpose,result.step);return true;
    case 'question':await question(phone,result.purpose,result.step,'data' in result?result.data:undefined);return true;
    case 'review':await review(phone,result.purpose,result.data);return true;
    case 'submit':{
      const reply=await submit(phone,JSON.stringify({...result.data,flow_token:issueFlowToken(phone,result.purpose,result.id)}));
      await db.delete(sessions).where(and(eq(sessions.id,result.id),eq(sessions.phoneHash,fingerprint)));
      await sendWhatsAppText(phone,reply);return true;
    }
  }
}

import { handleWhatsAppIntroduction } from '../referrals/whatsappIntroduction';
import { respondToTerms } from '../marketplace/termAgreement';
import { clearGuidedChat, continueGuidedChat, startGuidedChat } from './guidedChat';
import { businessEmail } from './registrationEmail';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import { auditLogsTable, companiesTable, companyVerificationDocumentsTable, commissionsTable, db, dealParticipantsTable, dealsTable, notificationsTable, referralsTable, usersTable, whatsappUserContextsTable } from '@workspace/db';
import { hashPassword } from '../auth/passwords';
import { recordPendingBuyerRequirement, buyerIntakeSchema } from '../akif/recordBuyerRequirement';
import { recordPendingSellerOffer, sellerOfferSchema } from '../akif/recordPendingSellerOffer';
import { downloadWhatsAppMedia, sendWhatsAppInteractive, sendWhatsAppText, sendWhatsAppTextWithMenu } from './client';
import { uploadDocumentBytes } from '../supabase/storage';
import { issueFlowToken, readFlowToken, type FlowPurpose } from './flowToken';
import { publishedFlowId } from './setupFlows';
import { agentReferralCode } from '../referrals/invitation';

export type ChatMessage={id?:string;from?:string;context?:{id?:string};text?:{body?:string};interactive?:{type?:string;button_reply?:{id?:string};list_reply?:{id?:string};nfm_reply?:{response_json?:string}};document?:{id?:string}};
const actions=['buyer','seller','agent','menu','profile','requirement','offer','deals','documents','verification','referrals','commissions','invite','ask','meeting','submit','restart','cancel','edit_profile'] as const;
export function chatAction(message:ChatMessage){
  const i=message.interactive;
  if(i?.type==='button_reply'||i?.type==='list_reply'){
    const id=i.type==='button_reply'?i.button_reply?.id:i.list_reply?.id;
    if(typeof id==='string'&&(actions.some(a=>id==='udc:'+a)||/^udc:deal:[a-f0-9-]{36}$/.test(id)))return id.slice(4);
    return 'invalid';
  }
  if(i?.type==='nfm_reply')return 'flow';
  const text=message.text?.body?.trim().toLowerCase();
  const typed:Record<string,string>={'my deals':'deals','show my deals':'deals','verification status':'verification','my profile':'profile','my commissions':'commissions','track referrals':'referrals'};
  return text ? typed[text] ?? (['menu','help','hi','hello','start','open menu','features'].includes(text)?'menu':null) : null;
}
const row=(id:string,title:string,description?:string)=>({id:'udc:'+id,title,...(description?{description}:{})});
export function menuForRole(role?:string){
  const common=[row('profile','My profile','Register or update your company details'),row('verification','Verification status'),row('documents','Upload documents','Company verification PDF'),row('ask','Ask Akif','Trade guidance and learning')];
  if(role==='buyer')return [row('requirement','Submit requirement'),row('deals','Offers & my deals'),row('meeting','Request a meeting'),...common];
  if(role==='seller')return [row('offer','Add an offer'),row('deals','Enquiries & my deals'),row('meeting','Request a meeting'),...common];
  if(role==='agent')return [row('invite','Invite someone'),row('referrals','Track referrals'),row('commissions','My commissions'),row('deals','Assigned deals'),...common.filter(item=>item.id!=='udc:documents')];
  return [];
}
export async function sendChatHome(phone:string){
  const [user]=await db.select({id:usersTable.id,role:usersTable.role,status:usersTable.status,email:usersTable.email}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
  if(user&&['suspended','rejected'].includes(user.status)){await sendWhatsAppTextWithMenu(phone,'Your account needs UDC review.');return;}
  const rows=menuForRole(user?.email?user.role:undefined);
  try{
    if(rows.length)await sendWhatsAppInteractive(phone,{type:'list',body:{text:`Your UDC ${user!.role} menu. Tap an option, or send a message or voice note naturally.`},action:{button:'Open menu',sections:[{title:'Your features',rows}]}});
    else await sendWhatsAppInteractive(phone,{type:'button',body:{text:'Welcome to UDC. How would you like to use UDC?'},action:{buttons:[['buyer','Buy products'],['seller','Sell products'],['agent','Agent services']].map(([id,title])=>({type:'reply' as const,reply:{id:'udc:'+id,title}}))}});
  }catch{await sendWhatsAppText(phone,rows.length?'The menu is temporarily unavailable. You can still type your trade requirement or offer naturally.':'The menu is temporarily unavailable. Type your requirement, offer, or “Register me as an agent”.');}
}
async function sendForm(phone:string,purpose:FlowPurpose){
  const kind=purpose==='profile_agent'?'agent':purpose.startsWith('profile_')?'profile':purpose as 'buyer'|'seller';
  const flow=await publishedFlowId(kind);
  if(!flow){
    const initial:Record<string,string>={};
    if(purpose.startsWith('profile_')){
      const [user]=await db.select().from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
      if(user?.email){
        const [company]=await db.select().from(companiesTable).where(eq(companiesTable.ownerUserId,user.id)).limit(1);
        for(const [key,value] of Object.entries({full_name:user.fullName,email:user.email,company_name:company?.companyName,country:company?.country??user.country,registration_number:company?.registrationNumber}))if(typeof value==='string'&&value)initial[key]=value;
      }
    }
    await startGuidedChat(phone,purpose,initial);return;
  }
  const profile=kind==='profile'||kind==='agent';
  await sendWhatsAppInteractive(phone,{type:'flow',body:{text:profile?'Complete your UDC details here in WhatsApp. Your registration requires UDC review.':'Fill in your trade details. Nothing is shared as an approved offer until UDC reviews it.'},action:{name:'flow',parameters:{flow_message_version:'3',flow_id:flow,flow_token:issueFlowToken(phone,purpose),flow_cta:profile?'Your details':'Open form',flow_action:'navigate',flow_action_payload:{screen:'START'}}}});
}
const optional=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():undefined;


export async function submitChatFlow(phone:string,raw:unknown){
  if(typeof raw!=='string'||raw.length>16000)return 'This form response is invalid. Open a new form from Menu.';
  let data:any;try{data=JSON.parse(raw);}catch{return 'This form response is invalid. Open a new form from Menu.';}
  const token=readFlowToken(data?.flow_token,phone);
  if(!token)return 'This form expired or belongs to another request. Open a new form from Menu.';
  try{return await db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'chat_flow:'+token.nonce}))`);
    const [seen]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'whatsapp_chat_form_saved'),sql`${auditLogsTable.metadata}->>'nonce' = ${token.nonce}`)).limit(1);
    if(seen)return 'This form was already received. Type Menu for your features.';
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'chat_profile:'+phone}))`);
    const [existing]=await tx.select().from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
    if(existing&&(!['buyer','seller','agent'].includes(existing.role)||['suspended','rejected'].includes(existing.status)))return 'Your account needs UDC review before this action.';
    let user=existing;let reply:string;
    if(token.purpose.startsWith('profile_')){
      const role=token.purpose.slice(8);
      const input=z.object({full_name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),company_name:z.string().trim().max(200).optional(),country:z.string().trim().max(120).optional(),registration_number:z.string().trim().max(100).optional()}).parse(data);
      if(existing&&existing.role!==role)return `Your account is already registered as ${existing.role}. UDC must review role changes.`;
      if(role!=='agent'&&(!businessEmail(input.email)||!input.company_name||!input.country))return 'Buyers and sellers need a company email, company name and country. Open My profile to submit those details. Agents may use personal or business email.';
      // An email is contact data; never bind it to an unrelated existing web identity.
      const [emailOwner]=await tx.select({id:usersTable.id}).from(usersTable).where(sql`lower(${usersTable.email}) = ${input.email}`).limit(1);
      if(emailOwner&&emailOwner.id!==existing?.id)return 'This email already belongs to a UDC profile. Ask UDC to review the accounts; profiles are never merged automatically.';
      if(existing){[user]=await tx.update(usersTable).set({fullName:input.full_name,email:input.email,country:input.country||null,...(existing.status==='verified' && (existing.email!==input.email || existing.fullName!==input.full_name || (existing.country||null)!==(input.country||null))?{status:'under_review'}:{}),updatedAt:new Date()}).where(eq(usersTable.id,existing.id)).returning();}
      else{[user]=await tx.insert(usersTable).values({phone,fullName:input.full_name,email:input.email,country:input.country||null,role,status:'pending',passwordHash:await hashPassword(randomBytes(32).toString('base64url'))}).returning();}
      if(input.company_name){
        const [company]=await tx.select().from(companiesTable).where(eq(companiesTable.ownerUserId,user.id)).limit(1);
        const fields={companyName:input.company_name,registrationNumber:input.registration_number||null,country:input.country||null};
        if(company){const changed=company.companyName!==fields.companyName||company.registrationNumber!==fields.registrationNumber||company.country!==fields.country;if(changed){await tx.update(companiesTable).set({...fields,verificationStatus:'pending',updatedAt:new Date()}).where(eq(companiesTable.id,company.id));if(user.status==='verified')await tx.update(usersTable).set({status:'under_review'}).where(eq(usersTable.id,user.id));}}
        else await tx.insert(companiesTable).values({ownerUserId:user.id,...fields,verificationStatus:'pending'});
      }
      reply=role==='agent'?'Your agent registration is saved for UDC review. Type Menu to check your verification status.':'Registration saved. Verification pending. Send your company documents using Upload documents. You can submit your requirement or offer now; it stays private until verification and review.';
    }else{
      if(!user)return 'Register first using Menu, then choose your role.';
      if(user.role!==token.purpose)return 'This form does not match your account role. Open your own Menu.';
      if(token.purpose==='buyer'){
        const input=buyerIntakeSchema.parse({phone,fullName:user.fullName||'WhatsApp buyer',product:data.product,quantity:data.quantity,unit:'MT',currency:'USD',destination:data.destination,incoterm:data.incoterm,specification:optional(data.specification),targetPrice:optional(data.target_price),deliveryTime:optional(data.delivery_time),paymentTerms:optional(data.payment_terms)});
        await recordPendingBuyerRequirement(input,tx);reply='Your requirement is saved for UDC review. I will keep you updated here in WhatsApp.';
      }else{
        const input=sellerOfferSchema.parse({phone,fullName:user.fullName||'WhatsApp seller',product:data.product,quantity:data.quantity,unit:data.unit,currency:data.currency,price:data.price,originCountry:data.origin,incoterm:data.incoterm,specification:optional(data.specification),availability:optional(data.availability),destination:optional(data.destination),paymentTerms:optional(data.payment_terms)});
        await recordPendingSellerOffer(input,tx);reply='Your offer is saved for UDC review. It is not an approved offer yet.';
      }
    }
    await tx.insert(auditLogsTable).values({actorUserId:user.id,action:'whatsapp_chat_form_saved',entityType:'user',entityId:user.id,metadata:{nonce:token.nonce,purpose:token.purpose,channel:'whatsapp',requiresAdminReview:true}});
    const admins=await tx.select({id:usersTable.id}).from(usersTable).where(and(eq(usersTable.role,'admin'),or(eq(usersTable.status,'active'),eq(usersTable.status,'verified')))).limit(100);
    if(admins.length)await tx.insert(notificationsTable).values(admins.map(admin=>({userId:admin.id,type:'whatsapp_form_submitted',title:'WhatsApp submission needs review',body:'A registration or trade form was submitted in WhatsApp.',link:'/admin'})));
    return reply;
  });}catch(error){if(error instanceof z.ZodError)return 'Please check the required fields, email and positive quantities/prices, then open a new form from Menu.';throw error;}
}

async function companyDocument(phone:string,message:ChatMessage){
  if(!message.document?.id||!message.context?.id)return false;
  const [user]=await db.select().from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
  if(!user||['suspended','rejected'].includes(user.status))return false;
  const [request]=await db.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'whatsapp_company_document_requested'),eq(auditLogsTable.actorUserId,user.id),sql`${auditLogsTable.metadata}->>'messageId' = ${message.context.id}`)).limit(1);
  if(!request)return false;
  const metadata=request.metadata as {companyId:string};
  const [company]=await db.select({id:companiesTable.id}).from(companiesTable).where(and(eq(companiesTable.id,metadata.companyId),eq(companiesTable.ownerUserId,user.id))).limit(1);
  if(!company){await sendWhatsAppTextWithMenu(phone,'That company request is no longer available. Open My profile first.');return true;}
  const media=await downloadWhatsAppMedia(message.document.id);
  const bytes=Buffer.from(media.bytes);
  if(bytes.length>5*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'){await sendWhatsAppTextWithMenu(phone,'Send a PDF under 5 MB as a reply to the document request.');return true;}
  await db.transaction(async tx=>{
    const fingerprint=message.id||message.document!.id!;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'company_doc:'+fingerprint}))`);
    const [seen]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'company_verification_document_uploaded'),eq(auditLogsTable.actorUserId,user.id),sql`${auditLogsTable.metadata}->>'providerMessageId' = ${fingerprint}`)).limit(1);
    if(seen)return;
    const fileUrl=await uploadDocumentBytes(`companies/${company.id}/${randomUUID()}.pdf`,bytes,'application/pdf');
    const [document]=await tx.insert(companyVerificationDocumentsTable).values({companyId:company.id,uploadedBy:user.id,documentType:'registration',fileUrl,status:'pending'}).returning({id:companyVerificationDocumentsTable.id});
    await tx.insert(auditLogsTable).values({actorUserId:user.id,action:'company_verification_document_uploaded',entityType:'company_verification_document',entityId:document.id,metadata:{companyId:company.id,channel:'whatsapp',providerMessageId:fingerprint}});
  });
  await sendWhatsAppTextWithMenu(phone,'Your company PDF is stored privately for UDC review. Uploading it does not verify your company.');return true;
}

export async function handleChatUi(phone:string,message:ChatMessage){
  if(await handleWhatsAppIntroduction(phone,message))return true;
  const termId=message.interactive?.button_reply?.id;
  const termAction=typeof termId==='string'?/^udc:terms:(accept|reject):([a-f0-9-]{36})$/.exec(termId):null;
  if(termAction){await respondToTerms(phone,termAction[2],termAction[1]==='accept');return true;}
  if(await companyDocument(phone,message))return true;
  const action=chatAction(message);
  if(!action || ['submit','restart','cancel'].includes(action)){
    const handled=await continueGuidedChat(phone,message,action,submitChatFlow);
    if(handled)return true;
    if(!action){
      if(message.text?.body){
        const [registered]=await db.select({email:usersTable.email}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
        if(!registered?.email){await sendChatHome(phone);return true;}
      }
      return false;
    }
    await sendChatHome(phone);return true;
  }
  if(action==='menu'){await sendChatHome(phone);return true;}
  if(action!=='flow')await clearGuidedChat(phone);
  if(action==='flow'){await sendWhatsAppTextWithMenu(phone,await submitChatFlow(phone,message.interactive?.nfm_reply?.response_json));return true;}
  const [user]=await db.select().from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
  if(user&&['suspended','rejected'].includes(user.status)){await sendWhatsAppTextWithMenu(phone,'Your account needs UDC review.');return true;}
  if(action==='invalid'){await sendChatHome(phone);return true;}
  if(['buyer','seller','agent'].includes(action)){
    if(user&&user.role!==action){await sendWhatsAppTextWithMenu(phone,`Your account is registered as ${user.role}. UDC must review role changes.`);return true;}
    await sendForm(phone,('profile_'+action) as FlowPurpose);return true;
  }
  if(!user){await sendChatHome(phone);return true;}
  if(action==='profile'){
    const [company]=await db.select().from(companiesTable).where(eq(companiesTable.ownerUserId,user.id)).limit(1);
    await sendWhatsAppTextWithMenu(phone,[user.fullName,user.email,company?.companyName,company?.country,`Verification: ${user.status==='verified'?'verified':'pending'}`].filter(Boolean).join('\n'));
    await sendWhatsAppInteractive(phone,{type:'button',body:{text:'Your saved details.'},action:{buttons:[{type:'reply',reply:{id:'udc:edit_profile',title:'Edit details'}}]}});return true;
  }
  if(action==='edit_profile'){await sendForm(phone,('profile_'+user.role) as FlowPurpose);return true;}
  if(action==='requirement'||action==='offer'){
    const role=action==='requirement'?'buyer':'seller';
    if(user.role!==role){await sendChatHome(phone);return true;}
    await sendForm(phone,role);return true;
  }
  if(action==='verification'){const [company]=await db.select({status:companiesTable.verificationStatus}).from(companiesTable).where(eq(companiesTable.ownerUserId,user.id)).limit(1);await sendWhatsAppTextWithMenu(phone,`Your account: ${user.status}. Company review: ${company?.status??'details not submitted'}. UDC reviews evidence before approval.`);return true;}
  if(action==='documents'){
    const [company]=await db.select({id:companiesTable.id}).from(companiesTable).where(eq(companiesTable.ownerUserId,user.id)).limit(1);
    if(!company){await sendWhatsAppTextWithMenu(phone,'Open My profile and add your company details first.');return true;}
    const sent=await sendWhatsAppTextWithMenu(phone,'Reply to THIS message with your company registration PDF (under 5 MB). It will be private and pending UDC review. For a deal document, reply to that deal’s message instead.');
    if(sent.delivered&&sent.messageId)await db.insert(auditLogsTable).values({actorUserId:user.id,action:'whatsapp_company_document_requested',entityType:'company',entityId:company.id,metadata:{companyId:company.id,messageId:sent.messageId}});return true;
  }
  if(action==='ask'){await sendWhatsAppTextWithMenu(phone,'Ask your trade question here, or send a voice note. I can explain trade terms, documents and the UDC process.');return true;}
  if(action==='meeting'){await sendWhatsAppTextWithMenu(phone,'Open My deals, choose the deal, then ask to arrange a video or in-person meeting. UDC reviews meetings and both trading parties must be verified.');return true;}
  if(['invite','referrals','commissions'].includes(action)){
    if(user.role!=='agent'||user.status!=='verified'){await sendWhatsAppTextWithMenu(phone,'Verified agent approval is required before introductions, referral tracking and commission access.');return true;}
    if(action==='invite'){const code=agentReferralCode(user.id);await sendWhatsAppTextWithMenu(phone,`Share this short code with them: ${code}. After they register as a UDC buyer or seller, they can send “Referral ${code}” here and confirm the introduction. UDC reviews it. No commission is agreed automatically.`);return true;}
    if(action==='referrals'){const rows=await db.select({code:referralsTable.referralCode,status:referralsTable.status}).from(referralsTable).where(eq(referralsTable.agentUserId,user.id)).orderBy(desc(referralsTable.createdAt)).limit(10);await sendWhatsAppTextWithMenu(phone,rows.length?rows.map(r=>`${r.code}: ${r.status}`).join('\n'):'No referrals have been recorded for you yet.');return true;}
    const rows=await db.select({amount:commissionsTable.amount,currency:commissionsTable.currency,status:commissionsTable.status}).from(commissionsTable).where(eq(commissionsTable.beneficiaryUserId,user.id)).orderBy(desc(commissionsTable.createdAt)).limit(10);await sendWhatsAppTextWithMenu(phone,rows.length?rows.map(r=>`${r.currency} ${r.amount}: ${r.status}`).join('\n'):'No agreed commissions have been recorded for you yet.');return true;
  }
  if(action==='deals'||action.startsWith('deal:')){
    if(user.status!=='verified'){await sendWhatsAppTextWithMenu(phone,'Your registration is pending UDC approval. Deal access starts after verification.');return true;}
    const fields={id:dealsTable.id,number:dealsTable.dealNumber,status:dealsTable.status};
    const rows=user.role==='agent'?await db.select(fields).from(dealsTable).innerJoin(dealParticipantsTable,eq(dealParticipantsTable.dealId,dealsTable.id)).where(and(eq(dealParticipantsTable.userId,user.id),eq(dealParticipantsTable.participantRole,'agent'),eq(dealParticipantsTable.status,'active'))).orderBy(desc(dealsTable.updatedAt)).limit(10):await db.select(fields).from(dealsTable).where(or(eq(dealsTable.buyerUserId,user.id),eq(dealsTable.sellerUserId,user.id))).orderBy(desc(dealsTable.updatedAt)).limit(10);
    if(action.startsWith('deal:')){const selected=rows.find(r=>r.id===action.slice(5));if(!selected){await sendWhatsAppTextWithMenu(phone,'That deal is unavailable. Open My deals again.');return true;}await db.insert(whatsappUserContextsTable).values({userId:user.id,activeDealId:selected.id}).onConflictDoUpdate({target:whatsappUserContextsTable.userId,set:{activeDealId:selected.id,updatedAt:new Date()}});await sendWhatsAppTextWithMenu(phone,`${selected.number}: ${selected.status}. Your next trade message will use this deal. Ask for its documents, status or a meeting here.`);return true;}
    if(!rows.length){await sendWhatsAppTextWithMenu(phone,'No approved deals are assigned to you yet. UDC will notify you when there is an update.');return true;}
    await sendWhatsAppInteractive(phone,{type:'list',body:{text:'Choose one of your authorized deals.'},action:{button:'My deals',sections:[{title:'Your deals',rows:rows.map(r=>row('deal:'+r.id,r.number.slice(0,24),r.status))}]}});return true;
  }
  await sendChatHome(phone);return true;
}

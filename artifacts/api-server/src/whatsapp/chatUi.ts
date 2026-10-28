import {emailAuth} from '../auth/emailAuth';
import { etaAdvisory, etaAdvisoryLabel } from "../tracking/etaAdvisory";
import { handleWhatsAppIntroduction } from '../referrals/whatsappIntroduction';
import { respondToTerms } from '../marketplace/termAgreement';
import { asksForOpenRequirements, openRequirementsReplyForSeller, respondToRequirementInterest } from '../marketplace/sellerRequirementNotify';
import { lcStatusReply } from '../deals/lcStatus';
import { isTesterPhone } from '../auth/testerMode';
import { clearGuidedChat, continueGuidedChat, startGuidedChat } from './guidedChat';
import { businessEmail } from './registrationEmail';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import { auditLogsTable, companiesTable, companyVerificationDocumentsTable, commissionsTable, db, dealFinancialsTable, dealParticipantsTable, dealsTable, notificationsTable, referralsTable, shipmentsTable, shipmentTrackingEventsTable, shipmentCargoUnitsTable, shipmentWatchesTable, usersTable, whatsappChatSessionsTable, whatsappUserContextsTable } from '@workspace/db';
import { hashPassword } from '../auth/passwords';
import { recordPendingBuyerRequirement, buyerIntakeSchema } from '../akif/recordBuyerRequirement';
import { recordPendingSellerOffer, sellerOfferSchema } from '../akif/recordPendingSellerOffer';
import { downloadWhatsAppMedia, sendWhatsAppInteractive, sendWhatsAppText, sendWhatsAppTextWithMenu } from './client';
import { uploadDocumentBytes } from '../supabase/storage';
import { issueFlowToken, readFlowToken, type FlowPurpose } from './flowToken';
import { publishedFlowId } from './setupFlows';
import { agentReferralCode, agentReferralWhatsAppCommand, agentReferralWhatsAppLink } from '../referrals/invitation';
import { agentJoinLink } from '../referrals/joinInvite';
import { claimInviteAfterRegistration, handleInviteDecline, handleJoinMessage, myInvitesReply } from '../referrals/joinService';
import { getVaultLinkIssuer } from '../vault/issuer';
import { publicDocumentStatus, vaultRedirectReply } from '../vault/uploadLink';
import { ADD_COMPANY_FIRST } from './uploadLinkIntent';
import { documentsStatusText, documentStatusFor, requiredDocuments, documentLabel } from './documentChecklist';
import { plainWordsAction } from './plainWordsIntent';
import { liveTrackingReply } from './liveTracking';
import { WATCH_MAX_PER_USER, WATCH_POLL_INTERVAL_MS } from '../tracking/shipmentWatch';
import { CONTACTS_LOCKED_REPLY, contactShareReply, contactsUnlocked } from '../deals/contactSharing';
import { parseDocumentPick } from './docUploadIntent';
import { guidanceKey } from './guidanceSession';
import {requestRoleChange,roleChangeReply} from '../accounts/roleChangeRequest';
import {PoolAllocationError,poolReplyText,respondToPoolInvite} from '../marketplace/poolInvites';

export type ChatMessage={id?:string;from?:string;context?:{id?:string};text?:{body?:string};interactive?:{type?:string;button_reply?:{id?:string};list_reply?:{id?:string};nfm_reply?:{response_json?:string}};document?:{id?:string}};
const actions=['buyer','seller','agent','menu','more','profile','requirement','offer','deals','documents','verification','referrals','commissions','invite','ask','meeting','track','submit','restart','cancel','edit_profile','change_role'] as const;
export function chatAction(message:ChatMessage){
  const i=message.interactive;
  if(i?.type==='button_reply'||i?.type==='list_reply'){
    const id=i.type==='button_reply'?i.button_reply?.id:i.list_reply?.id;
    if(typeof id==='string'&&(actions.some(a=>id==='udc:'+a)||/^udc:deal:[a-f0-9-]{36}$/.test(id)||/^udc:doc:upload:[a-z_]+$/.test(id)))return id.slice(4);
    return 'invalid';
  }
  if(i?.type==='nfm_reply')return 'flow';
  const text=message.text?.body?.trim().toLowerCase();
  const typed:Record<string,string>={
    'my deals':'deals','show my deals':'deals','switch role':'change_role','track shipment':'track','shipment status':'track','track my shipment':'track','verification status':'verification',
    'my profile':'profile','my commissions':'commissions','track referrals':'referrals',
    'my referrals':'referrals','referral code':'invite','my code':'invite','share code':'invite',
    'copy code':'invite','more options':'more','all options':'more',
    'buyer':'buyer','seller':'seller','agent':'agent',
  };
  // A menu is shown ONLY after an explicit menu request or menu-button selection.
  // Greetings, 'help' and ordinary chat must remain conversations with Akif.
  if(!text)return null;
  const roleRequest=/^(?:switch|change)(?: me)?(?: my role)? to (?:a |an )?(buyer|seller|agent)[.!?]*$/.exec(text);
  if(roleRequest)return roleRequest[1];
  return typed[text] ?? (text==='more'?'more':/^(?:(?:open|show|show me|show me the|send|send me)\s+)?(?:udc\s+)?menu[.!?]*$/.test(text)?'menu':null);
}
const row=(id:string,title:string,description?:string)=>({id:'udc:'+id,title,...(description?{description}:{})});
export function menuForRole(role?:string){
  const common=[row('profile','My profile','View or edit saved details'),row('change_role','Change role','Request review before switching'),row('verification','Verification status'),row('track','Track shipment','Latest recorded shipment update'),row('documents','Upload documents','Company verification PDF'),row('ask','Ask Akif','Trade guidance and learning')];
  if(role==='buyer')return [row('requirement','New requirement'),row('deals','My deals'),row('meeting','Request a meeting'),...common];
  if(role==='seller')return [row('offer','New product offer'),row('deals','My deals'),row('meeting','Request a meeting'),...common];
  if(role==='agent')return [row('invite','My referral code','Copy and share your code'),row('referrals','My referrals'),row('commissions','My commissions'),row('deals','Assigned deals'),...common.filter(item=>item.id!=='udc:documents')];
  return [];
}
function primaryActions(role:string){
  const choices=role==='agent'?[['invite','My code'],['referrals','Referrals']]:role==='seller'?[['offer','Add offer'],['deals','My deals']]:[['requirement','Buy products'],['deals','My deals']];
  return [...choices,['more','More options']].map(([id,title])=>({type:'reply' as const,reply:{id:'udc:'+id,title}}));
}
export async function sendChatHome(phone:string){
  const [user]=await db.select({id:usersTable.id,role:usersTable.role,status:usersTable.status,email:usersTable.email}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
  if(user&&['suspended','rejected'].includes(user.status)){await sendWhatsAppText(phone,'Your account needs UDC review.');return;}
  const role=user?.email?user.role:undefined;
  try{
    if(role)await sendWhatsAppInteractive(phone,{type:'button',body:{text:'What would you like to do? Choose below, or message Akif normally.'},action:{buttons:primaryActions(role)}});
    else await sendWhatsAppInteractive(phone,{type:'button',body:{text:'Welcome to UDC. Buyer, seller or agent? Choose below. Already registered on another number? Send Sign in followed by your registered email.'},action:{buttons:[['buyer','Buyer'],['seller','Seller'],['agent','Agent']].map(([id,title])=>({type:'reply' as const,reply:{id:'udc:'+id,title}}))}});
  }catch{await sendWhatsAppText(phone,role?'Menu unavailable. You can still message Akif, or send “My code”, “My deals”, or “More options”.':'Role buttons unavailable. Reply Buyer, Seller or Agent to continue registration, or type Menu to try again.');}
}
async function sendChatMore(phone:string){
  const [user]=await db.select({role:usersTable.role,status:usersTable.status,email:usersTable.email}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
  if(!user?.email||['suspended','rejected'].includes(user.status)){await sendChatHome(phone);return;}
  const rows=menuForRole(user.role);
  if(!rows.length){await sendChatHome(phone);return;}
  try{await sendWhatsAppInteractive(phone,{type:'list',body:{text:'All your UDC options in one place.'},action:{button:'Choose option',sections:[{title:'Trade & account',rows}]}});}
  catch{await sendWhatsAppText(phone,'Options are temporarily unavailable. You can still ask Akif directly.');}
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


// Agents need no company or document approval: a confirmed email opens their menu.
export function agentMenuOpen(u:{role:string;status:string;emailVerifiedAt?:Date|string|null}){
  return u.role==='agent'&&!['suspended','rejected'].includes(u.status)&&(u.status==='verified'||Boolean(u.emailVerifiedAt));
}
export async function submitChatFlow(phone:string,raw:unknown){
  if(typeof raw!=='string'||raw.length>16000)return 'This form response is invalid. Open a new form from Menu.';
  let data:any;try{data=JSON.parse(raw);}catch{return 'This form response is invalid. Open a new form from Menu.';}
  const token=readFlowToken(data?.flow_token,phone);
  if(!token)return 'This form expired or belongs to another request. Open a new form from Menu.';
  let otpUserId:string|null=null;
  try{const saved=await db.transaction(async tx=>{
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
      if(role!=='agent'&&(!businessEmail(input.email,phone)||!input.company_name||!input.country))return 'Buyers and sellers need a company email, company name and country. Open My profile to submit those details. Agents may use personal or business email.';
      // An email is contact data; never bind it to an unrelated existing web identity.
      const [emailOwner]=await tx.select({id:usersTable.id}).from(usersTable).where(sql`lower(${usersTable.email}) = ${input.email}`).limit(1);
      if(emailOwner&&emailOwner.id!==existing?.id)return 'This email already belongs to a UDC account. To access it from your new WhatsApp number, send Sign in followed by your email. An email OTP is required. Profiles are never merged automatically.';
      if(existing){[user]=await tx.update(usersTable).set({fullName:input.full_name,email:input.email,country:input.country||null,...(existing.status==='verified' && (existing.email!==input.email || existing.fullName!==input.full_name || (existing.country||null)!==(input.country||null))?{status:'under_review'}:{}),updatedAt:new Date()}).where(eq(usersTable.id,existing.id)).returning();}
      else{[user]=await tx.insert(usersTable).values({phone,fullName:input.full_name,email:input.email,country:input.country||null,role,status:'pending',passwordHash:await hashPassword(randomBytes(32).toString('base64url'))}).returning();}
      if(isTesterPhone(phone)){[user]=await tx.update(usersTable).set({emailVerifiedAt:new Date(),verifiedEmail:input.email,updatedAt:new Date()}).where(eq(usersTable.id,user.id)).returning();}
      if(input.company_name){
        const [company]=await tx.select().from(companiesTable).where(eq(companiesTable.ownerUserId,user.id)).limit(1);
        const fields={companyName:input.company_name,registrationNumber:input.registration_number||null,country:input.country||null};
        if(company){const changed=company.companyName!==fields.companyName||company.registrationNumber!==fields.registrationNumber||company.country!==fields.country;if(changed){await tx.update(companiesTable).set({...fields,verificationStatus:'pending',updatedAt:new Date()}).where(eq(companiesTable.id,company.id));if(user.status==='verified')await tx.update(usersTable).set({status:'under_review'}).where(eq(usersTable.id,user.id));}}
        else await tx.insert(companiesTable).values({ownerUserId:user.id,...fields,verificationStatus:'pending'});
      }
      reply=role==='agent'?'Your agent registration is saved for UDC review. Type Menu to check your verification status.{{VERIFY_HINT}}':'Registration saved. Verification pending. Send your company documents using Upload documents. You can submit your requirement or offer now; it stays private until verification and review.{{VERIFY_HINT}}';
      if(role!=='agent'){const inviteNote=await claimInviteAfterRegistration(tx as any,phone,user);if(inviteNote)reply+='\n\n'+inviteNote;}
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
    if(token.purpose.startsWith('profile_'))otpUserId=user.id;
    return reply;
  });
  if(otpUserId&&isTesterPhone(phone)){
    return saved.split('{{VERIFY_HINT}}').join('')+'\n\nEmail confirmed automatically (tester mode).';
  }
  if(otpUserId){
    try{
      if(!(await emailAuth.status(otpUserId)).emailVerified){await emailAuth.requestVerification(otpUserId);return saved.split('{{VERIFY_HINT}}').join('')+'\n\nI sent a 6-digit code to your email. Reply here with the code to confirm it. It expires in 10 minutes.';}
    }catch{/* email sending off or rate limited: user can still send Verify email later */}
  }
  return saved.split('{{VERIFY_HINT}}').join(' To confirm your email, send Verify email.');
  }catch(error){if(error instanceof z.ZodError)return 'Please check the required fields, email and positive quantities/prices, then open a new form from Menu.';throw error;}
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
  // Company verification records are confidential: never download, store or process them from WhatsApp.
  await sendWhatsAppTextWithMenu(phone,await vaultReplyFor({id:user.id,role:user.role},'company_registration'));return true;
}

async function vaultReplyFor(user:{id:string;role:string},type:'company_registration'){
  try{const issue=getVaultLinkIssuer();const link=issue?await issue(user,type):null;if(link?.ok)return vaultRedirectReply({url:link.url,expiresAt:link.expiresAt});}catch{}
  return vaultRedirectReply();
}

export async function handleChatUi(phone:string,message:ChatMessage,directOnly=false){
  if(directOnly)return continueGuidedChat(phone,message,null,submitChatFlow,true);
  {
    const joinText=message.text?.body;
    const joinReply=(await handleJoinMessage(phone,joinText))??(await handleInviteDecline(phone,joinText));
    if(joinReply!==null){await sendWhatsAppText(phone,joinReply);return true;}
    if(typeof joinText==='string'&&/^\s*my invites\s*$/i.test(joinText)){
      const [agent]=await db.select({id:usersTable.id,role:usersTable.role,status:usersTable.status,emailVerifiedAt:usersTable.emailVerifiedAt}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
      if(agent&&agentMenuOpen(agent)){await sendWhatsAppText(phone,await myInvitesReply(agent.id));return true;}
    }
  }
  if(await handleWhatsAppIntroduction(phone,message))return true;
  const termId=message.interactive?.button_reply?.id;
  const termAction=typeof termId==='string'?/^udc:terms:(accept|reject):([a-f0-9-]{36})$/.exec(termId):null;
  if(termAction){await respondToTerms(phone,termAction[2],termAction[1]==='accept');return true;}
  const reqAction=typeof termId==='string'?/^udc:req:(interested|pass):([a-f0-9-]{36})$/.exec(termId):null;
  if(reqAction){await respondToRequirementInterest(phone,reqAction[2],reqAction[1]==='interested');return true;}
  if(typeof message.text?.body==='string'&&asksForOpenRequirements(message.text.body)){
    const reply=await openRequirementsReplyForSeller(phone);
    if(reply){await sendWhatsAppText(phone,reply);return true;}
  }
  const poolAction=typeof termId==='string'?/^udc:pool:(accept|decline):([a-f0-9-]{36})$/.exec(termId):null;
  if(poolAction){
    const decision=poolAction[1]==='accept'?'accepted' as const:'declined' as const;
    const [buyer]=await db.select({id:usersTable.id,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
    if(!buyer||buyer.role!=='buyer'){await sendWhatsAppText(phone,'That invite is not available for this number.');return true;}
    try{const result=await respondToPoolInvite(buyer.id,poolAction[2],decision);await sendWhatsAppText(phone,poolReplyText(result,decision));}
    catch(error){await sendWhatsAppText(phone,error instanceof PoolAllocationError&&error.message.startsWith('invite_already_')?'You have already answered this invite.':'That invite is not available.');}
    return true;
  }
  if(await companyDocument(phone,message))return true;
  let action=chatAction(message);
  if(!action || ['submit','restart','cancel'].includes(action)){
    const handled=await continueGuidedChat(phone,message,action,submitChatFlow);
    if(handled)return true;
    if(!action){
      if(await handleDocumentPickText(phone,message.text?.body,Boolean(message.context?.id)))return true;
      // Plain-words menu: saying any menu item runs the same action as tapping it.
      const spoken=plainWordsAction(message.text?.body);
      if(!spoken)return false;
      action=spoken;
    }else{
      await sendWhatsAppText(phone,'No active form to change. Send Menu only if you want your options.');return true;
    }
  }
  if(action==='menu'){await sendChatHome(phone);return true;}
  if(action==='more'){await sendChatMore(phone);return true;}
  if(action!=='flow')await clearGuidedChat(phone);
  if(action==='flow'){await sendWhatsAppTextWithMenu(phone,await submitChatFlow(phone,message.interactive?.nfm_reply?.response_json));return true;}
  const [user]=await db.select().from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
  if(user&&['suspended','rejected'].includes(user.status)){await sendWhatsAppTextWithMenu(phone,'Your account needs UDC review.');return true;}
  if(action==='invalid'){await sendWhatsAppText(phone,'That option is no longer available. Send Menu if you want to see the current options.');return true;}
  if(action==='change_role'){
    if(!user){await sendWhatsAppText(phone,'Register first, then request a new role.');return true;}
    await sendWhatsAppInteractive(phone,{type:'button',body:{text:'Which role would you like UDC to review? Your existing verification and deal permissions remain unchanged until admin approval.'},
      action:{buttons:[['buyer','Buyer'],['seller','Seller'],['agent','Agent']].map(([id,title])=>({type:'reply' as const,reply:{id:'udc:'+id,title}}))}});
    return true;
  }
  if(['buyer','seller','agent'].includes(action)){
    if(user&&user.role!==action){
      const target=action as 'buyer'|'seller'|'agent';
      if(isTesterPhone(phone)){
        await db.update(usersTable).set({role:target,updatedAt:new Date()}).where(eq(usersTable.id,user.id));
        await db.insert(auditLogsTable).values({actorUserId:user.id,action:'tester_role_switch',entityType:'user',entityId:user.id,metadata:{from:user.role,to:target,testerMode:true}});
        await sendWhatsAppText(phone,`Role switched to ${target} (tester mode). Type Menu for that role's options.`);return true;
      }
      const result=await requestRoleChange(phone,target);
      await sendWhatsAppText(phone,roleChangeReply(result.status,target));return true;
    }
    await sendForm(phone,('profile_'+action) as FlowPurpose);return true;
  }
  if(!user){await sendWhatsAppText(phone,'Please register before using this feature. Send Menu to choose your role.');return true;}
  if(action==='profile'){
    const [company]=await db.select().from(companiesTable).where(eq(companiesTable.ownerUserId,user.id)).limit(1);
    await sendWhatsAppTextWithMenu(phone,[user.fullName,user.email,company?.companyName,company?.country,`Verification: ${user.status==='verified'?'verified':'pending'}`].filter(Boolean).join('\n'));
    await sendWhatsAppInteractive(phone,{type:'button',body:{text:'Your saved details.'},action:{buttons:[{type:'reply',reply:{id:'udc:edit_profile',title:'Edit details'}}]}});return true;
  }
  if(action==='edit_profile'){await sendForm(phone,('profile_'+user.role) as FlowPurpose);return true;}
  if(action==='requirement'||action==='offer'){
    const role=action==='requirement'?'buyer':'seller';
    if(user.role!==role){await sendWhatsAppText(phone,`Your account is registered as ${user.role}. Send Menu to see your available features.`);return true;}
    await sendForm(phone,role);return true;
  }
  if(action==='verification'){const [company]=await db.select({id:companiesTable.id,status:companiesTable.verificationStatus}).from(companiesTable).where(eq(companiesTable.ownerUserId,user.id)).limit(1);
    // Outcome states only: AKIF never reads or describes the document contents.
    const docs=company?await db.select({documentType:companyVerificationDocumentsTable.documentType,status:companyVerificationDocumentsTable.status}).from(companyVerificationDocumentsTable).where(eq(companyVerificationDocumentsTable.companyId,company.id)):[];
    const docLine=docs.length?`\nDocuments: ${docs.map(d=>`${String(d.documentType).replace(/_/g,' ')} - ${publicDocumentStatus(d.status)}`).join('; ')}.`:'\nDocuments: none received yet. Tap Upload documents in the menu to get a secure upload link.';
    if(!company){
      const u=user as {status:string;emailVerifiedAt?:Date|string|null};
      const t=['suspended','rejected'].includes(u.status)?'Your account is not active. Please contact service@updowncircle.site.'
        :u.status==='verified'?'Your account is verified by UDC.'
        :u.emailVerifiedAt?'Your email is confirmed. UDC approval is still pending. You can chat, upload documents and use your invite link meanwhile.'
        :'Your email is not confirmed yet. Send "Verify email" and I will email you a 6-digit code.';
      await sendWhatsAppTextWithMenu(phone,t);return true;
    }
    await sendWhatsAppTextWithMenu(phone,`Your account: ${user.status}. Company review: ${company?.status??'details not submitted'}.${docLine} UDC reviews evidence before approval. To confirm your email ownership, send Verify email.`);return true;}
  if(action==='documents'){await sendDocumentsOverview(phone,user);return true;}
  if(action.startsWith('doc:upload:')){const key=action.slice('doc:upload:'.length);await issueDocumentUploadLinks(phone,user,key==='all'?'all':[key]);return true;}
  if(action==='ask'){await sendWhatsAppTextWithMenu(phone,'Ask your trade question here, or send a voice note. I can explain trade terms, documents and the UDC process.');return true;}
  if(action==='meeting'){await sendWhatsAppTextWithMenu(phone,'Open My deals, choose the deal, then ask to arrange a video or in-person meeting. UDC reviews meetings and both trading parties must be verified.');return true;}
  if(['invite','referrals','commissions'].includes(action)){
    if(!agentMenuOpen(user)){await sendWhatsAppTextWithMenu(phone,user.role==='agent'?'Confirm your email first: send "Verify email" and I will email you a 6-digit code. Then your agent menu opens.':'These features are for agents.');return true;}
    if(action==='invite'){
       const joinLink=agentJoinLink(user.id,process.env.UDC_WHATSAPP_PUBLIC_NUMBER);
       if(joinLink){
         await sendWhatsAppText(phone,'Your personal invite link. When a buyer or seller taps it, WhatsApp opens the UDC chat with your code already typed. They only press send. UDC reviews every referral; no commission or deal access is granted automatically.');
         await sendWhatsAppText(phone,'Your code: '+agentReferralCode(user.id));
         await sendWhatsAppText(phone,joinLink);
         await sendWhatsAppText(phone,'Send "My invites" to see who joined.');
         return true;
       }
       const command=agentReferralWhatsAppCommand(user.id);
       await sendWhatsAppText(phone,
         'Forward or copy the NEXT message to your buyer or seller. After registering with UDC and agreeing to privacy terms, they must send the exact message to UDC and confirm your introduction. UDC reviews every referral; no commission or deal access is granted automatically.');
       await sendWhatsAppText(phone,command);
       const link=agentReferralWhatsAppLink(user.id,process.env.UDC_WHATSAPP_PUBLIC_NUMBER);
       if(link)await sendWhatsAppText(phone,
         'Optional UDC WhatsApp shortcut for your introduction (only after the buyer or seller registers): '+link);
       return true;
     }
    if(action==='referrals'){const rows=await db.select({code:referralsTable.referralCode,status:referralsTable.status}).from(referralsTable).where(eq(referralsTable.agentUserId,user.id)).orderBy(desc(referralsTable.createdAt)).limit(10);await sendWhatsAppTextWithMenu(phone,rows.length?rows.map(r=>`${r.code}: ${r.status}`).join('\n'):'No referrals have been recorded for you yet.');return true;}
    const rows=await db.select({amount:commissionsTable.amount,currency:commissionsTable.currency,status:commissionsTable.status}).from(commissionsTable).where(eq(commissionsTable.beneficiaryUserId,user.id)).orderBy(desc(commissionsTable.createdAt)).limit(10);await sendWhatsAppTextWithMenu(phone,rows.length?rows.map(r=>`${r.currency} ${r.amount}: ${r.status}`).join('\n'):'No agreed commissions have been recorded for you yet.');return true;
  }

  if(action.startsWith('tracknum:')){
    if(user.status!=='verified'){
      await sendWhatsAppTextWithMenu(phone,'Your registration is pending UDC approval. Tracking opens after verification.');
      return true;
    }
    await sendWhatsAppTextWithMenu(phone,await liveTrackingReply(action.slice('tracknum:'.length)));
    return true;
  }
  if(action==='deal_contact'){
    if(user.status!=='verified'){
      await sendWhatsAppTextWithMenu(phone,'Your registration is pending UDC approval. Deal features open after verification.');
      return true;
    }
    if(user.role!=='buyer'&&user.role!=='seller'){await sendWhatsAppTextWithMenu(phone,CONTACTS_LOCKED_REPLY);return true;}
    const [context]=await db.select({activeDealId:whatsappUserContextsTable.activeDealId})
      .from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,user.id)).limit(1);
    if(!context?.activeDealId){await sendWhatsAppTextWithMenu(phone,'Open My deals and select your deal first, then ask for contact details.');return true;}
    const [deal]=await db.select({id:dealsTable.id,status:dealsTable.status,buyerUserId:dealsTable.buyerUserId,sellerUserId:dealsTable.sellerUserId})
      .from(dealsTable).where(and(eq(dealsTable.id,context.activeDealId),or(eq(dealsTable.buyerUserId,user.id),eq(dealsTable.sellerUserId,user.id)))).limit(1);
    if(!deal){await sendWhatsAppTextWithMenu(phone,'That deal is no longer available to your account. Open My deals again.');return true;}
    if(!contactsUnlocked(deal.status)){await sendWhatsAppTextWithMenu(phone,CONTACTS_LOCKED_REPLY);return true;}
    const counterpartId=user.role==='buyer'?deal.sellerUserId:deal.buyerUserId;
    const [counterpart]=counterpartId?await db.select({fullName:usersTable.fullName,email:usersTable.email,phone:usersTable.phone}).from(usersTable).where(eq(usersTable.id,counterpartId)).limit(1):[];
    const [counterpartCompany]=counterpart?await db.select({companyName:companiesTable.companyName}).from(companiesTable).where(eq(companiesTable.ownerUserId,counterpartId)).limit(1):[];
    await sendWhatsAppTextWithMenu(phone,contactShareReply(user.role==='buyer'?'seller':'buyer',{
      fullName:counterpart?.fullName??null,companyName:counterpartCompany?.companyName??null,
      email:counterpart?.email??null,phone:counterpart?.phone??null,
    }));
    return true;
  }
  if(action==='bank_info'){
    // DECIDED (Master Plan v3, section 4): bank proof is asked just before the
    // SPA is signed, only through a private secure link - never in chat.
    await sendWhatsAppTextWithMenu(phone,'UDC will ask for bank proof through a private secure link just before the SPA is signed. Nothing is needed before that, and you never send bank details in this chat.');
    return true;
  }
  if(action.startsWith('watchnum:')){
    if(user.status!=='verified'){
      await sendWhatsAppTextWithMenu(phone,'Your registration is pending UDC approval. Shipment watching opens after verification.');
      return true;
    }
    const number=action.slice('watchnum:'.length);
    const hours=Math.round(WATCH_POLL_INTERVAL_MS/3_600_000);
    const existing=await db.select({id:shipmentWatchesTable.id,active:shipmentWatchesTable.active}).from(shipmentWatchesTable)
      .where(eq(shipmentWatchesTable.userId,user.id)).limit(WATCH_MAX_PER_USER+1);
    if(existing.filter(w=>w.active).length>=WATCH_MAX_PER_USER){
      await sendWhatsAppTextWithMenu(phone,`You already have ${WATCH_MAX_PER_USER} watched numbers. Send Unwatch followed by a number to free one up.`);
      return true;
    }
    const [context]=await db.select({activeDealId:whatsappUserContextsTable.activeDealId})
      .from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,user.id)).limit(1);
    await db.insert(shipmentWatchesTable).values({userId:user.id,trackingNumber:number,dealId:context?.activeDealId??null})
      .onConflictDoUpdate({target:[shipmentWatchesTable.userId,shipmentWatchesTable.trackingNumber],set:{active:true,updatedAt:new Date()}});
    await sendWhatsAppTextWithMenu(phone,`I'll watch ${number} and message you here when it ships, is delayed or is delivered. Carriers are checked at most once every ${hours} hours. Send Unwatch ${number} to stop.`);
    return true;
  }
  if(action.startsWith('unwatchnum:')){
    const number=action.slice('unwatchnum:'.length);
    const stopped=await db.update(shipmentWatchesTable).set({active:false,updatedAt:new Date()})
      .where(and(eq(shipmentWatchesTable.userId,user.id),eq(shipmentWatchesTable.trackingNumber,number),eq(shipmentWatchesTable.active,true)))
      .returning({id:shipmentWatchesTable.id});
    await sendWhatsAppTextWithMenu(phone,stopped.length?`Stopped watching ${number}.`:`I'm not watching ${number}. Nothing changed.`);
    return true;
  }
  if(action==='track'){
    if(user.status!=='verified'){
      await sendWhatsAppTextWithMenu(phone,'Your registration is pending UDC approval. Tracking opens after verification.');
      return true;
    }
    const [context]=await db.select({activeDealId:whatsappUserContextsTable.activeDealId})
      .from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,user.id)).limit(1);
    if(!context?.activeDealId){
      await sendWhatsAppTextWithMenu(phone,'Open My deals and select your deal first, then choose Track shipment.');
      return true;
    }
    // Verify membership on EVERY tracking request: saved WhatsApp context alone never grants access.
    const fields={id:dealsTable.id,number:dealsTable.dealNumber,status:dealsTable.status};
    const own=user.role==='agent'
      ?await db.select(fields).from(dealsTable)
        .innerJoin(dealParticipantsTable,eq(dealParticipantsTable.dealId,dealsTable.id))
        .where(and(eq(dealsTable.id,context.activeDealId),eq(dealParticipantsTable.userId,user.id),
          eq(dealParticipantsTable.participantRole,'agent'),eq(dealParticipantsTable.status,'active'))).limit(1)
      :await db.select(fields).from(dealsTable)
        .where(and(eq(dealsTable.id,context.activeDealId),or(eq(dealsTable.buyerUserId,user.id),eq(dealsTable.sellerUserId,user.id)))).limit(1);
    const deal=own[0];
    if(!deal){
      await sendWhatsAppTextWithMenu(phone,'That deal is no longer available to your account. Open My deals again.');
      return true;
    }
    const shipments=await db.select({
      id:shipmentsTable.id,carrier:shipmentsTable.carrier,trackingNumber:shipmentsTable.trackingNumber,
      status:shipmentsTable.status,origin:shipmentsTable.origin,destination:shipmentsTable.destination,
      estimatedArrival:shipmentsTable.estimatedArrival,updatedAt:shipmentsTable.updatedAt,
    }).from(shipmentsTable).where(eq(shipmentsTable.dealId,deal.id))
      .orderBy(desc(shipmentsTable.updatedAt)).limit(3);
    const safe=(v:unknown)=>typeof v==='string'?v.trim().slice(0,120):'';
    const date=(v:unknown)=>{
      const time=v instanceof Date?v:new Date(String(v));
      return Number.isFinite(time.valueOf())?time.toISOString().slice(0,16).replace('T',' ')+' UTC':'';
    };
    const lines=[`Tracking — ${safe(deal.number)}`,`Deal stage: ${safe(deal.status)}`];
    if(!shipments.length)lines.push('No shipment has been recorded yet.');
    for(const [index,shipment] of shipments.entries()){
      lines.push(`Shipment ${index+1}: ${safe(shipment.status)||'not recorded'}`);
      if(user.role!=='agent'){
        if(shipment.carrier)lines.push(`Carrier: ${safe(shipment.carrier)}`);
        if(shipment.trackingNumber)lines.push(`Reference: ${safe(shipment.trackingNumber)}`);
        if(shipment.origin||shipment.destination)lines.push(`Route: ${safe(shipment.origin)||'unknown'} → ${safe(shipment.destination)||'unknown'}`);
      }
      const eta=shipment.estimatedArrival?date(shipment.estimatedArrival):'';
      if(eta)lines.push(`Recorded ETA: ${eta}`);
      const updated=shipment.updatedAt?date(shipment.updatedAt):'';
      if(updated)lines.push(`Last UDC update: ${updated}`);
    }
    const cargoUnits=await db.select({
      shipmentId:shipmentCargoUnitsTable.shipmentId,
      transportMode:shipmentCargoUnitsTable.transportMode,
      unitReference:shipmentCargoUnitsTable.unitReference,
      status:shipmentCargoUnitsTable.status,
      vesselName:shipmentCargoUnitsTable.vesselName,
      voyageNumber:shipmentCargoUnitsTable.voyageNumber,
      flightNumber:shipmentCargoUnitsTable.flightNumber,
      vehicleReference:shipmentCargoUnitsTable.vehicleReference,
      billOfLading:shipmentCargoUnitsTable.billOfLading,
      airWaybill:shipmentCargoUnitsTable.airWaybill,
      currentLocation:shipmentCargoUnitsTable.currentLocation,
      lastReportedAt:shipmentCargoUnitsTable.lastReportedAt,
      estimatedArrival:shipmentCargoUnitsTable.estimatedArrival,
    }).from(shipmentCargoUnitsTable).where(eq(shipmentCargoUnitsTable.dealId,deal.id))
      .orderBy(shipmentCargoUnitsTable.createdAt).limit(50);
    const relatedUnits=cargoUnits.filter(unit=>shipments.some(shipment=>shipment.id===unit.shipmentId)).slice(0,6);
    if(relatedUnits.length){
      lines.push('Cargo units (UDC records):');
      for(const unit of relatedUnits){
        const shipmentPosition=shipments.findIndex(shipment=>shipment.id===unit.shipmentId)+1;
        const advisory=etaAdvisory(unit.status,unit.estimatedArrival,unit.lastReportedAt);
        if(user.role==='agent'){
          lines.push(`Shipment ${shipmentPosition}: ${safe(unit.transportMode)} cargo · ${safe(unit.status)}`);
        }else{
          lines.push(`Shipment ${shipmentPosition}: ${safe(unit.transportMode)} · ${safe(unit.unitReference)} · ${safe(unit.status)}`);
          const transitInfo=unit.transportMode==='sea'
            ?[unit.vesselName,unit.voyageNumber,unit.billOfLading]
            :unit.transportMode==='air'
              ?[unit.flightNumber,unit.airWaybill]
              :[unit.vehicleReference];
          if(transitInfo.some(Boolean))lines.push(`Carrier details (recorded): ${transitInfo.map(safe).filter(Boolean).join(' / ')}`);
          if(unit.currentLocation)lines.push(`Last recorded location: ${safe(unit.currentLocation)}`);
          if(unit.estimatedArrival)lines.push(`Recorded unit ETA: ${date(unit.estimatedArrival)}`);
        }
        const text=etaAdvisoryLabel(advisory);
        if(text)lines.push(text);
      }
      if(cargoUnits.length>relatedUnits.length)lines.push('More cargo records are available from UDC.');
    }
    const events=await db.select({
      shipmentId:shipmentTrackingEventsTable.shipmentId,kind:shipmentTrackingEventsTable.kind,shipmentStatus:shipmentTrackingEventsTable.shipmentStatus,
      source:shipmentTrackingEventsTable.source,sourceReference:shipmentTrackingEventsTable.sourceReference,
      location:shipmentTrackingEventsTable.location,note:shipmentTrackingEventsTable.note,
      occurredAt:shipmentTrackingEventsTable.occurredAt,
    }).from(shipmentTrackingEventsTable).where(eq(shipmentTrackingEventsTable.dealId,deal.id))
      .orderBy(desc(shipmentTrackingEventsTable.occurredAt)).limit(50);
    const visible=events.filter(event=>shipments.some(s=>s.id===event.shipmentId)).slice(0,5);
    if(visible.length){
      lines.push('Recent shipment milestones:');
      for(const event of visible){
        const dateLabel=date(event.occurredAt);
        const shipmentPosition=shipments.findIndex(s=>s.id===event.shipmentId)+1;
        lines.push(`• Shipment ${shipmentPosition}: ${safe(event.kind)}${event.shipmentStatus?' ('+safe(event.shipmentStatus)+')':''}${dateLabel?' · '+dateLabel:''}`);
        if(user.role!=='agent'){
          if(event.location)lines.push(`Location recorded: ${safe(event.location)}`);
          if(event.note)lines.push(`UDC note: ${safe(event.note)}`);
          const source=event.source==='carrier_reported'?'carrier-reported':event.source==='document_checked'?'document-checked':'manually recorded';
          lines.push(`Source: ${source}`);
        }
      }
    }
    lines.push('These are UDC-recorded updates, not live carrier GPS. Confirm details against shipping documents.');
    await sendWhatsAppTextWithMenu(phone,lines.join('\n'));
    return true;
  }
  if(action==='deals'||action.startsWith('deal:')){
    if(user.status!=='verified'){await sendWhatsAppTextWithMenu(phone,'Your registration is pending UDC approval. Deal access starts after verification.');return true;}
    const fields={id:dealsTable.id,number:dealsTable.dealNumber,status:dealsTable.status};
    const rows=user.role==='agent'?await db.select(fields).from(dealsTable).innerJoin(dealParticipantsTable,eq(dealParticipantsTable.dealId,dealsTable.id)).where(and(eq(dealParticipantsTable.userId,user.id),eq(dealParticipantsTable.participantRole,'agent'),eq(dealParticipantsTable.status,'active'))).orderBy(desc(dealsTable.updatedAt)).limit(10):await db.select(fields).from(dealsTable).where(or(eq(dealsTable.buyerUserId,user.id),eq(dealsTable.sellerUserId,user.id))).orderBy(desc(dealsTable.updatedAt)).limit(10);
    if(action.startsWith('deal:')){const selected=rows.find(r=>r.id===action.slice(5));if(!selected){await sendWhatsAppTextWithMenu(phone,'That deal is unavailable. Open My deals again.');return true;}await db.insert(whatsappUserContextsTable).values({userId:user.id,activeDealId:selected.id}).onConflictDoUpdate({target:whatsappUserContextsTable.userId,set:{activeDealId:selected.id,updatedAt:new Date()}});const [confirmedLc]=await db.select({id:dealFinancialsTable.id}).from(dealFinancialsTable).where(and(eq(dealFinancialsTable.dealId,selected.id),eq(dealFinancialsTable.instrumentType,'DLC'),eq(dealFinancialsTable.status,'confirmed'))).limit(1);await sendWhatsAppTextWithMenu(phone,`${lcStatusReply(selected.number,selected.status,Boolean(confirmedLc))} Your next trade message will use this deal. Ask for its documents, status or a meeting here.`);await sendWhatsAppInteractive(phone,{type:'button',body:{text:'Track this shipment or choose another deal.'},action:{buttons:[{type:'reply',reply:{id:'udc:track',title:'Track shipment'}},{type:'reply',reply:{id:'udc:deals',title:'My deals'}}]}});return true;}
    if(!rows.length){await sendWhatsAppTextWithMenu(phone,'No approved deals are assigned to you yet. UDC will notify you when there is an update.');return true;}
    await sendWhatsAppInteractive(phone,{type:'list',body:{text:'Choose one of your authorized deals.'},action:{button:'My deals',sections:[{title:'Your deals',rows:rows.map(r=>row('deal:'+r.id,r.number.slice(0,24),r.status))}]}});return true;
  }
  await sendWhatsAppText(phone,'This option is unavailable. Send Menu if you need to choose another.');return true;
}

/** Plain "send me the link" requests: same result as Menu, More options, Documents. Returns false when the sender is not a usable account. */
type DocUser={id:string;role:string;fullName?:string|null};

async function ensureDocCompany(phone:string,user:DocUser){
  const [existing]=await db.select({id:companiesTable.id}).from(companiesTable).where(eq(companiesTable.ownerUserId,user.id)).limit(1);
  if(existing)return existing;
  // Tester numbers on staging never hit a dead end: a placeholder company holds their uploads.
  if(!isTesterPhone(phone))return null;
  const [created]=await db.insert(companiesTable).values({ownerUserId:user.id,companyName:user.fullName?`${user.fullName}’s company`:'Test company'}).returning({id:companiesTable.id});
  return created??null;
}

const DOC_LIST_FLAG_MS=30*60_000;
async function writeDocListFlag(phone:string,value:string){
  try{
    const phoneHash=guidanceKey(phone);
    const [saved]=await db.select().from(whatsappChatSessionsTable).where(eq(whatsappChatSessionsTable.phoneHash,phoneHash)).limit(1);
    if(!saved)return; // merge into an existing chat session only; never create one for a flag
    const data={...(saved.data??{}),__docList:value};
    await db.update(whatsappChatSessionsTable).set({data,expiresAt:new Date(Date.now()+72*60*60_000),updatedAt:new Date()}).where(eq(whatsappChatSessionsTable.phoneHash,phoneHash));
  }catch{/* the flag is a convenience, never a blocker */}
}
async function docListContextActive(phone:string):Promise<boolean>{
  try{
    const [saved]=await db.select().from(whatsappChatSessionsTable).where(eq(whatsappChatSessionsTable.phoneHash,guidanceKey(phone))).limit(1);
    const ts=Number(saved?.data?.__docList);
    return Number.isFinite(ts)&&ts>0&&Date.now()-ts<DOC_LIST_FLAG_MS;
  }catch{return false;}
}

async function issueDocumentUploadLinks(phone:string,user:DocUser,pick:'all'|string[]):Promise<void>{
  if(user.role==='agent'){await sendWhatsAppTextWithMenu(phone,'Agents do not upload company documents. Buyers and sellers share company documents; your verified agent profile is enough.');return;}
  const required=requiredDocuments(user.role);
  if(!required.length){if(user.role==='agent')await sendWhatsAppTextWithMenu(phone,'Agents do not upload company documents. Buyers and sellers share company documents; your verified agent profile is enough.');return;}
  const company=await ensureDocCompany(phone,user);
  if(!company){await sendWhatsAppTextWithMenu(phone,ADD_COMPANY_FIRST);return;}
  const docRows=await db.select({documentType:companyVerificationDocumentsTable.documentType,status:companyVerificationDocumentsTable.status}).from(companyVerificationDocumentsTable).where(eq(companyVerificationDocumentsTable.companyId,company.id));
  const valid=required.map(d=>d.key);
  const keys=[...new Set((pick==='all'?valid:pick).filter(k=>valid.includes(k)))].filter(k=>documentStatusFor(docRows,k)!=='verified');
  if(!keys.length){await sendWhatsAppTextWithMenu(phone,'Those documents are already verified. Send Menu, then Upload documents, for your current list.');return;}
  const docType=keys.length===1?keys[0]:'multi:'+keys.join(',');
  let link:{url:string;expiresAt:Date}|null=null;
  try{const issue=getVaultLinkIssuer();const result=issue?await issue({id:user.id,role:user.role},docType):null;if(result?.ok)link={url:result.url,expiresAt:result.expiresAt};}catch{}
  if(!link){await sendWhatsAppTextWithMenu(phone,'I could not create your private upload link just now. Please try again in a minute.');return;}
  const intro=keys.length===1
    ?`Your private upload link for ${documentLabel(keys[0])} (single use, works 15 minutes):`
    :`One private link for ${keys.length} documents - one tap uploads them all (works 15 minutes):\n\n${keys.map((k,i)=>`${i+1}. ${documentLabel(k)}`).join('\n')}`;
  await sendWhatsAppText(phone,`${intro}\n\n${link.url}\n\nOnly UDC's verification team can open what you upload. I only get the result, never the document.`);
  await writeDocListFlag(phone,String(Date.now()));
}

// Short follow-ups to the Upload documents list: "1", "1.2.3", "upload 1",
// "1 , 2 and 3 I wanna upload all of it", "all". Bare numbers need the list
// context (a recent list or a quoted reply to it); explicit upload wording
// always counts. The list itself is never answered with a menu loop.
export async function handleDocumentPickText(phone:string,text:string|undefined,quotedReply=false):Promise<boolean>{
  if(!text)return false;
  const [user]=await db.select().from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
  if(!user||!['buyer','seller'].includes(user.role)||['suspended','rejected'].includes(user.status))return false;
  const required=requiredDocuments(user.role);
  if(!required.length)return false;
  const contextActive=quotedReply||await docListContextActive(phone);
  const pick=parseDocumentPick(text,required.length,contextActive);
  if(!pick)return false;
  await writeDocListFlag(phone,'');
  await issueDocumentUploadLinks(phone,user,pick.kind==='all'?'all':pick.indexes.map(i=>required[i-1].key));
  return true;
}

async function sendDocumentsOverview(phone:string,user:DocUser):Promise<void>{
  if(user.role==='agent'){await sendWhatsAppTextWithMenu(phone,'Agents do not upload company documents. Buyers and sellers share company documents; your verified agent profile is enough.');return;}
  const company=await ensureDocCompany(phone,user);
  const docs=company?await db.select({documentType:companyVerificationDocumentsTable.documentType,status:companyVerificationDocumentsTable.status}).from(companyVerificationDocumentsTable).where(eq(companyVerificationDocumentsTable.companyId,company.id)):[];
  const list=documentsStatusText(user.role,docs);
  if(!company){await sendWhatsAppTextWithMenu(phone,`${list}\n${ADD_COMPANY_FIRST}`);return;}
  const missing=requiredDocuments(user.role).map((d,i)=>({...d,index:i+1})).filter(d=>documentStatusFor(docs,d.key)!=='verified');
  await sendWhatsAppTextWithMenu(phone,`${list}\nPlease don't send passports, IDs, bank statements or company records on WhatsApp - chats aren't a safe place for them.\nFor a trade document inside a deal, reply to that deal’s message instead.`);
  if(missing.length){
    const rows=missing.map(d=>row('doc:upload:'+d.key,`Upload ${d.index}`,d.label.slice(0,72)));
    if(missing.length>1)rows.push(row('doc:upload:all','Upload all','One private link for every missing document'));
    await sendWhatsAppInteractive(phone,{type:'list',body:{text:'Tap a document for its private upload link, or reply with its number (or "all").'},action:{button:'Upload',sections:[{title:'Missing documents',rows}]}});
    await writeDocListFlag(phone,String(Date.now()));
  }
}
export async function sendDocumentsLink(phone:string):Promise<boolean>{
  const [user]=await db.select().from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
  if(!user||['suspended','rejected'].includes(user.status))return false;
  await sendDocumentsOverview(phone,user);return true;
}

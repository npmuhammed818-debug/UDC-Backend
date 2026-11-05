import {currentEmailAccountConsent} from '../channels/emailAccount';
import {and,desc,eq,sql} from 'drizzle-orm';
import {db,usersTable,whatsappUserContextsTable,dealsTable,buyerRequestsTable,auditLogsTable,sellerListingsTable,notificationPreferencesTable} from '@workspace/db';
import {priceWatchCommand,priceBelow} from '../marketData/priceWatch';
import {minorUnitDigits} from '../referrals/currencyPrecision';
import {approvedCompanyEvidence} from '../marketplace/verifiedCounterparties';
import {canAutomaticallyPresentOffer} from '../marketplace/matchScoring';
import {sendWhatsAppText} from './client';
export async function handlePriceWatch(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging')return false;const command=priceWatchCommand(text);if(!command)return false;
 const [u]=await db.select({id:usersTable.id,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!u||u.role!=='buyer'||u.status!=='verified'){await sendWhatsAppText(phone,'Price watches need a verified buyer account.');return true;}
 const [ctx]=await db.select({dealId:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1);
 const [d]=ctx?await db.select({requestId:dealsTable.buyerRequestId}).from(dealsTable).where(and(eq(dealsTable.id,ctx.dealId),eq(dealsTable.buyerUserId,u.id))).limit(1):[];
 const [r]=d?.requestId?await db.select().from(buyerRequestsTable).where(and(eq(buyerRequestsTable.id,d.requestId),eq(buyerRequestsTable.buyerUserId,u.id),eq(buyerRequestsTable.status,'approved'))).limit(1):[];
 if(!r){await sendWhatsAppText(phone,'Select a buyer deal with your own approved requirement first. No watch was changed.');return true;}
 if(!command.off&&(minorUnitDigits(command.currency)===null||command.currency!==r.currency||!/[1-9]/.test(command.threshold))){await sendWhatsAppText(phone,'Use the approved requirement currency and a positive threshold. No rate conversion or watch change made.');return true;}
 await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'price_watch:'+u.id+':'+r.id}))`);await tx.insert(auditLogsTable).values({actorUserId:u.id,action:'price_watch_preference',entityType:'buyer_request',entityId:r.id,metadata:command.off?{off:true}:{off:false,threshold:command.threshold,currency:command.currency,unit:r.unit}});});
 await sendWhatsAppText(phone,command.off?'Price watch is off for this requirement.':`Price watch saved below ${command.threshold} ${command.currency} per ${r.unit} for this approved requirement. Alerts use current compatible approved listings from verified sellers, not the whole market. No order or price change. Send price watch off to stop.`);return true;
}
/** Safe staging delivery only. Never enable real provider sends via this runner. A future
 * launch needs review of customer window/templates, delivery receipts and release authority. */
export async function runPriceWatches(){
 if(process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return {checked:0,alerts:0,disabled:true};
 const watches=await db.selectDistinctOn([auditLogsTable.actorUserId,auditLogsTable.entityId]).from(auditLogsTable).where(eq(auditLogsTable.action,'price_watch_preference')).orderBy(auditLogsTable.actorUserId,auditLogsTable.entityId,desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(101);
 if(watches.length>100)throw Error('price_watch_batch_requires_review');let alerts=0;
 for(const watch of watches){const m=watch.metadata;if(!watch.actorUserId||!watch.entityId||m?.off!==false||typeof m.threshold!=='string'||typeof m.currency!=='string'||typeof m.unit!=='string')continue;
 await db.transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'price_watch:'+watch.actorUserId+':'+watch.entityId}))`);
 const [latest]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'price_watch_preference'),eq(auditLogsTable.actorUserId,watch.actorUserId!),eq(auditLogsTable.entityId,watch.entityId!))).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(1);if(latest?.id!==watch.id)return;
 const [u]=await tx.select({id:usersTable.id,phone:usersTable.phone,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,watch.actorUserId!)).limit(1);if(!u?.phone||u.role!=='buyer'||u.status!=='verified'||!await approvedCompanyEvidence(u.id,tx))return;
 if(!await currentEmailAccountConsent(u.id))return;const [preferences]=await tx.select({optional:notificationPreferencesTable.optionalWhatsApp,announcements:notificationPreferencesTable.announcements}).from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId,u.id)).limit(1);if(preferences&&(preferences.optional===false||preferences.announcements===false))return;
 const [r]=await tx.select().from(buyerRequestsTable).where(and(eq(buyerRequestsTable.id,watch.entityId!),eq(buyerRequestsTable.buyerUserId,u.id),eq(buyerRequestsTable.status,'approved'))).limit(1);if(!r||r.currency!==m.currency||r.unit!==m.unit)return;
 const listings=await tx.select().from(sellerListingsTable).where(and(eq(sellerListingsTable.productId,r.productId),eq(sellerListingsTable.status,'approved'),eq(sellerListingsTable.currency,r.currency),eq(sellerListingsTable.unit,r.unit))).orderBy(desc(sellerListingsTable.updatedAt)).limit(50);
 for(const listing of listings){if(Date.now()-listing.updatedAt.getTime()>7*86400000||listing.updatedAt.getTime()>Date.now()+60000||!priceBelow(listing.price,m.threshold as string)||!canAutomaticallyPresentOffer(r,listing))continue;
 const [seller]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,listing.sellerUserId)).limit(1);if(seller?.role!=='seller'||seller.status!=='verified'||!await approvedCompanyEvidence(listing.sellerUserId,tx))continue;
 const fingerprint=listing.id+':'+listing.updatedAt.toISOString();const [prior]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'price_watch_alerted'),eq(auditLogsTable.actorUserId,u.id),eq(auditLogsTable.entityId,watch.id),sql`${auditLogsTable.metadata}->>'fingerprint'=${fingerprint}`)).limit(1);if(prior)continue;
 const sent=await sendWhatsAppText(u.phone,`Price watch: a current compatible approved listing is ${listing.price} ${listing.currency} per ${listing.unit}, below your ${m.threshold} threshold. Listing updated ${listing.updatedAt.toISOString()}. This is a seller listing, not a market index or binding offer. Ask UDC to review fresh terms. No order, payment or seller switch made.`);
 if(sent.delivered){await tx.insert(auditLogsTable).values({actorUserId:u.id,action:'price_watch_alerted',entityType:'price_watch',entityId:watch.id,metadata:{fingerprint,requirementId:r.id,listingId:listing.id,syntheticSink:true}});alerts++;}break;
 }
 });
 }
 return {checked:watches.length,alerts,disabled:false};
}
export function startPriceWatchRunner(){if(process.env.UDC_PRICE_WATCH_ENABLED!=='true'||process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return;let busy=false;const run=async()=>{if(busy)return;busy=true;try{await runPriceWatches();}catch{}finally{busy=false;}};void run();const timer=setInterval(()=>void run(),3600000);timer.unref();}

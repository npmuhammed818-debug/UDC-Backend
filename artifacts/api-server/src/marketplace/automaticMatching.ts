import { asc,eq } from 'drizzle-orm';
import { db,buyerRequestsTable } from '@workspace/db';
import { presentInitialVerifiedOffer } from './termAgreement';
import { notifyMatchingSellers } from './sellerRequirementNotify';

let started=false,busy=false,offset=0;
export function startAutomaticMatching(log:{error:(details:object,message:string)=>unknown}){
 if(started)return;started=true;
 const run=async()=>{
  if(busy)return;busy=true;
  try{
   // Rotate through bounded batches so older unmatched requests do not starve later ones.
   const requests=await db.select({id:buyerRequestsTable.id}).from(buyerRequestsTable).where(eq(buyerRequestsTable.status,'approved')).orderBy(asc(buyerRequestsTable.createdAt),asc(buyerRequestsTable.id)).limit(20).offset(offset);
   offset=requests.length<20?0:offset+20;
   for(const request of requests){
    try{await presentInitialVerifiedOffer(request.id);}catch{log.error({event:'automatic_match_retry_required'},'Approved requirement matching will be checked again');}
    try{await notifyMatchingSellers(request.id);}catch{log.error({event:'seller_requirement_notify_retry_required'},'Seller requirement notification will be checked again');}
   }
  }catch{log.error({event:'automatic_matching_unavailable'},'Automatic matching will retry');}
  finally{busy=false;}
 };
 void run();const timer=setInterval(()=>void run(),30000);timer.unref();
}

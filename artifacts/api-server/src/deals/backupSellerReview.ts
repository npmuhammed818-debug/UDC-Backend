import {and,desc,eq,inArray} from 'drizzle-orm';
import {db,auditLogsTable,dealsTable,buyerRequestsTable,usersTable,sellerListingsTable} from '@workspace/db';
import {approvedCompanyEvidence} from '../marketplace/verifiedCounterparties';
import {canAutomaticallyPresentOffer} from '../marketplace/matchScoring';
/** Admin preparation only: current compatible listing leads, never a reserved
 * seller or a replacement deal. Read current buyer-owned terms, not seller history. */
export async function backupSellerReview(requestId:string){
 if(process.env.UDC_APP_ENV!=='staging')return {error:404};
 return db.transaction(async tx=>{
 const [request]=await tx.select({buyer:auditLogsTable.actorUserId,dealId:auditLogsTable.entityId}).from(auditLogsTable).where(and(eq(auditLogsTable.id,requestId),inArray(auditLogsTable.action,['trade_assist_backup_seller','trade_assist_switch_seller']))).limit(1);if(!request?.buyer||!request.dealId)return {error:404};
 const [buyer]=await tx.select({status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,request.buyer)).limit(1).for('share');if(buyer?.status!=='verified'||buyer.role!=='buyer'||!await approvedCompanyEvidence(request.buyer,tx,undefined,true))return {error:409};
 const [deal]=await tx.select({buyer:dealsTable.buyerUserId,seller:dealsTable.sellerUserId,requirement:dealsTable.buyerRequestId}).from(dealsTable).where(eq(dealsTable.id,request.dealId)).limit(1).for('share');if(!deal||deal.buyer!==request.buyer||!deal.requirement)return {error:409};
 const [requirement]=await tx.select().from(buyerRequestsTable).where(and(eq(buyerRequestsTable.id,deal.requirement),eq(buyerRequestsTable.buyerUserId,request.buyer),eq(buyerRequestsTable.status,'approved'))).limit(1).for('share');if(!requirement||!requirement.companyId||!await approvedCompanyEvidence(request.buyer,tx,requirement.companyId,true))return {error:409};
 const listings=await tx.select().from(sellerListingsTable).where(and(eq(sellerListingsTable.productId,requirement.productId),eq(sellerListingsTable.status,'approved'),eq(sellerListingsTable.currency,requirement.currency),eq(sellerListingsTable.unit,requirement.unit))).orderBy(desc(sellerListingsTable.updatedAt)).limit(201).for('share');if(listings.length>200)return {error:422};
 const candidates=[];const seen=new Set<string>();
 for(const listing of listings){if(listing.sellerUserId===deal.seller||seen.has(listing.sellerUserId)||listing.updatedAt.getTime()>Date.now()+60000||Date.now()-listing.updatedAt.getTime()>7*86400000||!canAutomaticallyPresentOffer(requirement,listing))continue;
 const [seller]=await tx.select({status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,listing.sellerUserId)).limit(1).for('share');if(seller?.status!=='verified'||seller.role!=='seller'||!listing.companyId||!await approvedCompanyEvidence(listing.sellerUserId,tx,listing.companyId,true))continue;
 seen.add(listing.sellerUserId);candidates.push({listingId:listing.id,listingUpdatedAt:listing.updatedAt,currency:listing.currency,unit:listing.unit,incoterm:listing.incoterm,destination:listing.destination,needsFreshProposal:true});if(candidates.length===5)break;
 }
 return {requestId,candidates,coverage:'At most 200 current same-product/currency/unit listings checked; at most 5 distinct alternate sellers. Seven-day listing freshness. Compatibility is a review lead, not agreement or guaranteed availability.',sellerReserved:false,dealCreated:false,sharedWithBuyer:false,notice:'Private UDC review only. Original seller excluded. No old seller messages, documents or prices copied. No contact, seller switch or commitment made. Review exact fresh specifications, shipping, payment and inspection terms with the buyer before any new deal.'};
 });
}

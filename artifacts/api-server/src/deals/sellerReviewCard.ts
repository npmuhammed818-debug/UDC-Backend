import {and,eq} from 'drizzle-orm';
import {db,usersTable,dealsTable,sellerListingsTable,companiesTable,companyVerificationDocumentsTable} from '@workspace/db';
/** Recorded review facts for a selected buyer's existing seller, never a fraud,
 * credit, stock or delivery verdict. No documents or private review notes. */
export async function sellerReviewCard(userId:string,dealId:string,executor?:Pick<typeof db,"select">){
 const read=async(tx:Pick<typeof db,"select">)=>{
 const [buyer]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(buyer?.role!=='buyer'||buyer.status!=='verified')return {error:403};
 const [deal]=await tx.select({number:dealsTable.dealNumber,seller:dealsTable.sellerUserId,listing:dealsTable.sellerListingId}).from(dealsTable).where(and(eq(dealsTable.id,dealId),eq(dealsTable.buyerUserId,userId))).limit(1).for('share');if(!deal?.seller)return {error:404};
 const [seller]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,deal.seller)).limit(1).for('share');
 const accountReviewed=seller?.role==='seller'&&seller.status==='verified';
 const [listing]=deal.listing?await tx.select({status:sellerListingsTable.status,at:sellerListingsTable.updatedAt,company:sellerListingsTable.companyId}).from(sellerListingsTable).where(and(eq(sellerListingsTable.id,deal.listing),eq(sellerListingsTable.sellerUserId,deal.seller))).limit(1).for('share'):[];
 const [company]=listing?.company?await tx.select({id:companiesTable.id,status:companiesTable.verificationStatus}).from(companiesTable).where(and(eq(companiesTable.id,listing.company),eq(companiesTable.ownerUserId,deal.seller))).limit(1).for('share'):[];
 const [evidence]=company?.status==='verified'?await tx.select({id:companyVerificationDocumentsTable.id}).from(companyVerificationDocumentsTable).where(and(eq(companyVerificationDocumentsTable.companyId,company.id),eq(companyVerificationDocumentsTable.status,'approved'))).limit(1).for('share'):[];
 const age=listing?Date.now()-listing.at.getTime():NaN;
 return {dealNumber:deal.number,asOf:new Date(),accountReviewed:Boolean(accountReviewed),listedCompanyReviewed:Boolean(evidence),listingCurrent:listing?.status==='approved'&&age>=0&&age<=7*86400000,authenticityVerified:false,stockVerified:false,guarantee:false,notice:'Recorded account, listing and listed-company review only. Missing or expired review evidence is not a finding of fraud. Approval is not a guarantee of identity, document authenticity, current stock, quality, payment safety or delivery. Check fresh evidence with UDC before agreeing terms. No private review notes or files shared.'};
};return executor?read(executor):db.transaction(read);}

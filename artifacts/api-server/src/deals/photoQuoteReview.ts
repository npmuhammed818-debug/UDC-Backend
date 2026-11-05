import {photoQuoteLines} from './photoQuoteLines';
import {and,eq,sql} from 'drizzle-orm';
import {db,usersTable,dealsTable,documentsTable,documentAccessTable,documentExtractionsTable} from '@workspace/db';
/** Read-only price-list review. OCR/model strings are unverified source material,
 * not a quote from UDC, seller availability, sender authority or an order. */
export async function photoQuoteReview(userId:string,dealId:string,documentId:string){return db.transaction(async tx=>{
 const [u]=await tx.select({status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(!u||u.status!=='verified'||u.role!=='buyer')return {error:403};
 const [d]=await tx.select({number:dealsTable.dealNumber}).from(dealsTable).where(and(eq(dealsTable.id,dealId),eq(dealsTable.buyerUserId,userId))).limit(1).for('share');if(!d)return {error:404};
 const [doc]=await tx.select({type:documentsTable.documentType}).from(documentsTable).innerJoin(documentAccessTable,eq(documentAccessTable.documentId,documentsTable.id)).where(and(eq(documentsTable.id,documentId),eq(documentsTable.dealId,dealId),eq(documentAccessTable.userId,userId),eq(documentsTable.status,'approved'))).limit(1).for('share');if(!doc||!['image','price_list','product_photo'].includes(doc.type))return {error:404};
 const [e]=await tx.select({data:documentExtractionsTable.structuredData,status:documentExtractionsTable.status,at:documentExtractionsTable.updatedAt}).from(documentExtractionsTable).innerJoin(documentsTable,eq(documentsTable.id,documentExtractionsTable.documentId)).where(and(eq(documentExtractionsTable.documentId,documentId),eq(documentExtractionsTable.dealId,dealId),sql`${documentExtractionsTable.updatedAt}>=${documentsTable.updatedAt}`)).limit(1).for('share');if(!e||!['completed','needs_review'].includes(e.status))return {error:409};
 const items=photoQuoteLines(e.data);if(!items)return {error:422};
 return {dealNumber:d.number,documentId,extractionAsOf:e.at,items,sourceUnverified:true,requiresHumanReview:true,sellerMatched:false,requirementCreated:false,notice:'Unverified extracted price-list rows for your private review. Check each product, decimal, currency code, unit and price against the original photo. No seller was matched or contacted, and no requirement, quotation, order or agreement was created. A shop price is not a verified UDC seller offer.'};
});}

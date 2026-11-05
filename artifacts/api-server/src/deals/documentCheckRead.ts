import {and,eq,sql} from 'drizzle-orm';
import {db,usersTable,dealsTable,documentsTable,documentAccessTable,documentExtractionsTable} from '@workspace/db';
import {documentCheck} from './documentCheck';
/** Shared private comparison. Current source/grant/revision only. Reading never
 * approves a document, changes a grant or establishes authenticity/payment. */
export async function documentCheckRead(userId:string,dealId:string,documentId:string){return db.transaction(async tx=>{
 const [u]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(u?.status!=='verified'||!['buyer','seller'].includes(u.role))return {error:403};
 const [deal]=await tx.select({quantity:dealsTable.quantity,unit:dealsTable.unit,agreedPrice:dealsTable.agreedPrice,currency:dealsTable.currency,incoterm:dealsTable.incoterm,destination:dealsTable.destination}).from(dealsTable).where(and(eq(dealsTable.id,dealId),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,userId))).limit(1).for('share');if(!deal)return {error:404};
 const [doc]=await tx.select({id:documentsTable.id}).from(documentsTable).innerJoin(documentAccessTable,eq(documentAccessTable.documentId,documentsTable.id)).where(and(eq(documentsTable.id,documentId),eq(documentsTable.dealId,dealId),eq(documentsTable.status,'approved'),eq(documentAccessTable.userId,userId))).limit(1).for('share');if(!doc)return {error:404};
 const [extraction]=await tx.select({data:documentExtractionsTable.structuredData,status:documentExtractionsTable.status,at:documentExtractionsTable.updatedAt}).from(documentExtractionsTable).innerJoin(documentsTable,and(eq(documentsTable.id,documentExtractionsTable.documentId),eq(documentsTable.dealId,documentExtractionsTable.dealId))).where(and(eq(documentExtractionsTable.documentId,documentId),eq(documentExtractionsTable.dealId,dealId),sql`${documentExtractionsTable.updatedAt}>=${documentsTable.updatedAt}`)).limit(1).for('share');if(!extraction||!['completed','needs_review'].includes(extraction.status))return {error:409};
 return {documentId,extractionAsOf:extraction.at,...documentCheck(deal,extraction.data)};
});}

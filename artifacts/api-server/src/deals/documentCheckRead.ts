import {documentReviewToken,documentHumanFields} from './documentHumanReview';
import {and,eq,sql,desc} from 'drizzle-orm';
import {db,usersTable,dealsTable,documentsTable,documentAccessTable,documentExtractionsTable,auditLogsTable} from '@workspace/db';
import {documentCheck} from './documentCheck';
/** Shared private comparison. Current source/grant/revision only. Reading never
 * approves a document, changes a grant or establishes authenticity/payment. */
export async function documentCheckRead(userId:string,dealId:string,documentId:string,executor?:Pick<typeof db,"select">){
 const read=async(tx:Pick<typeof db,"select">)=>{
 const [u]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(u?.status!=='verified'||!['buyer','seller'].includes(u.role))return {error:403};
 const [deal]=await tx.select({quantity:dealsTable.quantity,unit:dealsTable.unit,agreedPrice:dealsTable.agreedPrice,currency:dealsTable.currency,incoterm:dealsTable.incoterm,destination:dealsTable.destination}).from(dealsTable).where(and(eq(dealsTable.id,dealId),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,userId))).limit(1).for('share');if(!deal)return {error:404};
 const [doc]=await tx.select({id:documentsTable.id}).from(documentsTable).innerJoin(documentAccessTable,eq(documentAccessTable.documentId,documentsTable.id)).where(and(eq(documentsTable.id,documentId),eq(documentsTable.dealId,dealId),eq(documentsTable.status,'approved'),eq(documentAccessTable.userId,userId))).limit(1).for('share');if(!doc)return {error:404};
 const [extraction]=await tx.select({data:documentExtractionsTable.structuredData,status:documentExtractionsTable.status,at:documentExtractionsTable.updatedAt,revision:sql<string>`${documentExtractionsTable.updatedAt}::text`,documentRevision:sql<string>`${documentsTable.updatedAt}::text`}).from(documentExtractionsTable).innerJoin(documentsTable,and(eq(documentsTable.id,documentExtractionsTable.documentId),eq(documentsTable.dealId,documentExtractionsTable.dealId))).where(and(eq(documentExtractionsTable.documentId,documentId),eq(documentExtractionsTable.dealId,dealId),sql`${documentExtractionsTable.updatedAt}>=${documentsTable.updatedAt}`)).limit(1).for('share');if(!extraction||!['completed','needs_review'].includes(extraction.status))return {error:409};
 const token=documentReviewToken(dealId,documentId,extraction.documentRevision,extraction.revision,extraction.data);
 const [review]=await tx.select({metadata:auditLogsTable.metadata,at:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'document_fields_human_reviewed'),eq(auditLogsTable.entityId,dealId),sql`${auditLogsTable.metadata}->>'documentId'=${documentId}`,sql`${auditLogsTable.metadata}->>'reviewToken'=${token}`)).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(1).for('share');
 const corrected=documentHumanFields.safeParse(review?.metadata?.fields);
 return {documentId,extractionAsOf:extraction.at,...documentCheck(deal,extraction.data),humanReview:review&&corrected.success?{at:review.at,checks:documentCheck(deal,corrected.data).checks,notice:'Separate human-checked transcription, not authenticity, terms or payment approval.'}:null};
};return executor?read(executor):db.transaction(read);}

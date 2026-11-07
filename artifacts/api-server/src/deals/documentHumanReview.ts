import {createHash} from 'node:crypto';
import {and,eq,sql,desc} from 'drizzle-orm';
import {z} from 'zod/v4';
import {db,usersTable,dealsTable,documentsTable,documentExtractionsTable,auditLogsTable} from '@workspace/db';
export const documentHumanFields=z.object({quantity:z.object({value:z.string().regex(/^\d+(?:\.\d+)?$/).max(40),unit:z.string().trim().min(1).max(30)}).strict(),pricing:z.object({unitPrice:z.string().regex(/^\d+(?:\.\d+)?$/).max(40),currency:z.string().regex(/^[A-Z]{3}$/),basis:z.string().trim().min(1).max(30)}).strict(),logistics:z.object({incoterm:z.string().trim().max(30),destination:z.string().trim().max(120)}).strict()}).strict();
export const documentHumanReviewInput=z.object({reviewToken:z.string().regex(/^[a-f0-9]{64}$/),checkedAgainstOriginal:z.literal(true),fields:documentHumanFields,note:z.string().trim().min(5).max(500)}).strict();
export function documentReviewToken(dealId:string,documentId:string,documentRevision:string,extractionRevision:string,data:unknown){return createHash('sha256').update(JSON.stringify([dealId,documentId,documentRevision,extractionRevision,data])).digest('hex');}
/** A human transcription correction, not source authenticity, document approval,
 * terms acceptance or payment permission. Original extraction stays untouched. */
async function load(tx:Pick<typeof db,'select'>,adminId:string,dealId:string,documentId:string){
 const [operator]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,adminId)).limit(1).for('share');
 if(operator?.role!=='admin'||!['active','verified'].includes(operator.status))return {error:403} as const;
 const [deal]=await tx.select({id:dealsTable.id}).from(dealsTable).where(eq(dealsTable.id,dealId)).limit(1).for('share');if(!deal)return {error:404} as const;
 const [doc]=await tx.select({id:documentsTable.id,revision:sql<string>`${documentsTable.updatedAt}::text`,status:documentsTable.status}).from(documentsTable).where(and(eq(documentsTable.id,documentId),eq(documentsTable.dealId,dealId))).limit(1).for('share');if(!doc)return {error:404} as const;
 const [extraction]=await tx.select({data:documentExtractionsTable.structuredData,status:documentExtractionsTable.status,revision:sql<string>`${documentExtractionsTable.updatedAt}::text`}).from(documentExtractionsTable).where(and(eq(documentExtractionsTable.documentId,documentId),eq(documentExtractionsTable.dealId,dealId),sql`${documentExtractionsTable.updatedAt} >= ${documentsTable.updatedAt}`)).innerJoin(documentsTable,eq(documentsTable.id,documentExtractionsTable.documentId)).limit(1).for('share');
 if(!extraction||!['completed','needs_review'].includes(extraction.status))return {error:409} as const;
 const reviewToken=documentReviewToken(dealId,documentId,doc.revision,extraction.revision,extraction.data);
 const [prior]=await tx.select({metadata:auditLogsTable.metadata,at:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'document_fields_human_reviewed'),eq(auditLogsTable.entityId,dealId),sql`${auditLogsTable.metadata}->>'documentId'=${documentId}`,sql`${auditLogsTable.metadata}->>'reviewToken'=${reviewToken}`)).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(1);
 return {documentId,reviewToken,documentStatus:doc.status,extractedFields:extraction.data,review:prior?{fields:prior.metadata?.fields,note:prior.metadata?.note,at:prior.at}:null,notice:'Check each field against the original private PDF. Corrections are recorded separately and do not rewrite the model extraction, deal terms, document approval or payment permissions.'};
}
export async function readDocumentHumanReview(adminId:string,dealId:string,documentId:string){return db.transaction(tx=>load(tx,adminId,dealId,documentId));}
export async function recordDocumentHumanReview(adminId:string,dealId:string,documentId:string,input:z.infer<typeof documentHumanReviewInput>){return db.transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'document-human-review:'+documentId}))`);
 const current=await load(tx,adminId,dealId,documentId);if('error'in current)return current;
 if(current.reviewToken!==input.reviewToken)return {error:409} as const;
 if(current.review)return {error:409} as const;
 await tx.insert(auditLogsTable).values({actorUserId:adminId,action:'document_fields_human_reviewed',entityType:'deal',entityId:dealId,metadata:{documentId,reviewToken:input.reviewToken,fields:input.fields,note:input.note,checkedAgainstOriginal:true,authenticityVerified:false,documentApproved:false,termsChanged:false}});
 return {recorded:true,documentApproved:false,termsChanged:false,notice:'Human-checked transcription recorded for this exact extraction. The original extraction and deal terms remain unchanged. Review the document separately before approval.'};
});}

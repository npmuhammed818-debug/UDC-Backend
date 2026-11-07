import {documentReviewToken,documentHumanFields} from '../deals/documentHumanReview';
import {and,asc,desc,eq,getTableColumns,sql} from 'drizzle-orm';
import {db,documentsTable,documentExtractionsTable,auditLogsTable} from '@workspace/db';
/** Context must not promote terms extracted before the current document revision.
 * Compare in PostgreSQL, preserving sub-millisecond timestamps. This freshness
 * filter is not an access grant; each caller must still apply its viewer scope. */
export async function currentDocumentExtractions(dealId:string){
 const rows=await db.select({...getTableColumns(documentExtractionsTable),documentRevision:sql<string>`${documentsTable.updatedAt}::text`,extractionRevision:sql<string>`${documentExtractionsTable.updatedAt}::text`}).from(documentExtractionsTable).innerJoin(documentsTable,and(eq(documentsTable.id,documentExtractionsTable.documentId),eq(documentsTable.dealId,documentExtractionsTable.dealId))).where(and(eq(documentExtractionsTable.dealId,dealId),sql`${documentExtractionsTable.updatedAt}>=${documentsTable.updatedAt}`)).orderBy(asc(documentExtractionsTable.createdAt));
 return Promise.all(rows.map(async({documentRevision,extractionRevision,...row})=>{
  const token=documentReviewToken(dealId,row.documentId,documentRevision,extractionRevision,row.structuredData);
  const [review]=await db.select({metadata:auditLogsTable.metadata,at:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'document_fields_human_reviewed'),eq(auditLogsTable.entityId,dealId),sql`${auditLogsTable.metadata}->>'documentId'=${row.documentId}`,sql`${auditLogsTable.metadata}->>'reviewToken'=${token}`)).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(1);
  const fields=documentHumanFields.safeParse(review?.metadata?.fields);
  return {...row,humanReview:review&&fields.success?{fields:fields.data,at:review.at,meaning:'Human-checked transcription of this exact source, not document authenticity, deal terms, approval or payment permission.'}:null};
 }));
}

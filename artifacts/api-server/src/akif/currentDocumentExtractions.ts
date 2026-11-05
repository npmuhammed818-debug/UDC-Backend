import {and,asc,eq,getTableColumns,sql} from 'drizzle-orm';
import {db,documentsTable,documentExtractionsTable} from '@workspace/db';
/** Context must not promote terms extracted before the current document revision.
 * Compare in PostgreSQL, preserving sub-millisecond timestamps. This freshness
 * filter is not an access grant; each caller must still apply its viewer scope. */
export async function currentDocumentExtractions(dealId:string){return db.select(getTableColumns(documentExtractionsTable)).from(documentExtractionsTable).innerJoin(documentsTable,and(eq(documentsTable.id,documentExtractionsTable.documentId),eq(documentsTable.dealId,documentExtractionsTable.dealId))).where(and(eq(documentExtractionsTable.dealId,dealId),sql`${documentExtractionsTable.updatedAt}>=${documentsTable.updatedAt}`)).orderBy(asc(documentExtractionsTable.createdAt));}

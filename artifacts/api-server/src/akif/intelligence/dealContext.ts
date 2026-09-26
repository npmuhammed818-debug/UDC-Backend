import { asc, eq } from "drizzle-orm";
import {
  auditLogsTable,
  db,
  dealFinancialsTable,
  dealParticipantsTable,
  dealsTable,
  documentsTable,
  inspectionsTable,
  shipmentsTable,
} from "@workspace/db";

export async function getAkifDealContext(dealId: string) {
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, dealId))
    .limit(1);

  if (!deal) return null;

  const [participants, documents, financials, inspections, shipments, history] =
    await Promise.all([
      db.select().from(dealParticipantsTable).where(eq(dealParticipantsTable.dealId, dealId)),
      db.select().from(documentsTable).where(eq(documentsTable.dealId, dealId)).orderBy(asc(documentsTable.createdAt)),
      db.select().from(dealFinancialsTable).where(eq(dealFinancialsTable.dealId, dealId)).orderBy(asc(dealFinancialsTable.createdAt)),
      db.select().from(inspectionsTable).where(eq(inspectionsTable.dealId, dealId)).orderBy(asc(inspectionsTable.createdAt)),
      db.select().from(shipmentsTable).where(eq(shipmentsTable.dealId, dealId)).orderBy(asc(shipmentsTable.createdAt)),
      db.select().from(auditLogsTable).where(eq(auditLogsTable.entityId, dealId)).orderBy(asc(auditLogsTable.createdAt)),
    ]);

  return {
    deal,
    participants,
    documents,
    financials,
    inspections,
    shipments,
    history,
  };
}

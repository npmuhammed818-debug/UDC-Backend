import { and, asc, eq } from "drizzle-orm";
import {
  auditLogsTable,
  buyerRequestsTable,
  commissionsTable,
  companiesTable,
  db,
  dealConversationEventsTable,
  dealFinancialsTable,
  dealParticipantsTable,
  dealsTable,
  documentExtractionsTable,
  documentsTable,
  inspectionsTable,
  matchesTable,
  productsTable,
  sellerListingsTable,
  shipmentsTable,
  usersTable,
} from "@workspace/db";

const safeUserSelection = {
  id: usersTable.id,
  email: usersTable.email,
  phone: usersTable.phone,
  fullName: usersTable.fullName,
  role: usersTable.role,
  status: usersTable.status,
  country: usersTable.country,
  userType: usersTable.userType,
};

export async function getAkifDealContext(dealId: string) {
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, dealId))
    .limit(1);

  if (!deal) return null;

  const [
    product,
    buyerRequest,
    sellerListing,
    buyerUser,
    sellerUser,
    participants,
    documents,
    documentExtractions,
    financials,
    inspections,
    shipments,
    commissions,
    conversation,
    history,
  ] = await Promise.all([
    db.select().from(productsTable).where(eq(productsTable.id, deal.productId)).limit(1),
    deal.buyerRequestId
      ? db.select().from(buyerRequestsTable).where(eq(buyerRequestsTable.id, deal.buyerRequestId)).limit(1)
      : Promise.resolve([]),
    deal.sellerListingId
      ? db.select().from(sellerListingsTable).where(eq(sellerListingsTable.id, deal.sellerListingId)).limit(1)
      : Promise.resolve([]),
    db.select(safeUserSelection).from(usersTable).where(eq(usersTable.id, deal.buyerUserId)).limit(1),
    db.select(safeUserSelection).from(usersTable).where(eq(usersTable.id, deal.sellerUserId)).limit(1),
    db.select().from(dealParticipantsTable).where(eq(dealParticipantsTable.dealId, dealId)),
    db.select().from(documentsTable).where(eq(documentsTable.dealId, dealId)).orderBy(asc(documentsTable.createdAt)),
    db.select().from(documentExtractionsTable).where(eq(documentExtractionsTable.dealId, dealId)).orderBy(asc(documentExtractionsTable.createdAt)),
    db.select().from(dealFinancialsTable).where(eq(dealFinancialsTable.dealId, dealId)).orderBy(asc(dealFinancialsTable.createdAt)),
    db.select().from(inspectionsTable).where(eq(inspectionsTable.dealId, dealId)).orderBy(asc(inspectionsTable.createdAt)),
    db.select().from(shipmentsTable).where(eq(shipmentsTable.dealId, dealId)).orderBy(asc(shipmentsTable.createdAt)),
    db.select().from(commissionsTable).where(eq(commissionsTable.dealId, dealId)).orderBy(asc(commissionsTable.createdAt)),
    db.select().from(dealConversationEventsTable).where(eq(dealConversationEventsTable.dealId, dealId)).orderBy(asc(dealConversationEventsTable.createdAt)),
    db.select().from(auditLogsTable).where(eq(auditLogsTable.entityId, dealId)).orderBy(asc(auditLogsTable.createdAt)),
  ]);

  const buyerCompanyId = buyerRequest[0]?.companyId;
  const sellerCompanyId = sellerListing[0]?.companyId;

  const [buyerCompany, sellerCompany, match] = await Promise.all([
    buyerCompanyId
      ? db.select().from(companiesTable).where(eq(companiesTable.id, buyerCompanyId)).limit(1)
      : Promise.resolve([]),
    sellerCompanyId
      ? db.select().from(companiesTable).where(eq(companiesTable.id, sellerCompanyId)).limit(1)
      : Promise.resolve([]),
    deal.buyerRequestId && deal.sellerListingId
      ? db.select()
          .from(matchesTable)
          .where(and(
            eq(matchesTable.buyerRequestId, deal.buyerRequestId),
            eq(matchesTable.sellerListingId, deal.sellerListingId),
          ))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    deal,
    product: product[0] ?? null,
    buyerRequest: buyerRequest[0] ?? null,
    sellerListing: sellerListing[0] ?? null,
    buyer: {
      user: buyerUser[0] ?? null,
      company: buyerCompany[0] ?? null,
    },
    seller: {
      user: sellerUser[0] ?? null,
      company: sellerCompany[0] ?? null,
    },
    match: match[0] ?? null,
    participants,
    documents,
    documentExtractions,
    financials,
    inspections,
    shipments,
    commissions,
    conversation,
    history,
  };
}

import { desc, eq, sql } from "drizzle-orm";
import {
  akifResearchRunsTable,
  buyerRequestsTable,
  db,
  dealsTable,
  matchesTable,
  sellerListingsTable,
} from "@workspace/db";

export async function getAkifAdminSummary() {
  const [
    [researchCount],
    [completedResearchCount],
    [openBuyerCount],
    [approvedSellerCount],
    [activeDealCount],
    [suggestedMatchCount],
    recentResearch,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(akifResearchRunsTable),
    db.select({ count: sql<number>`count(*)::int` }).from(akifResearchRunsTable)
      .where(eq(akifResearchRunsTable.status, "completed")),
    db.select({ count: sql<number>`count(*)::int` }).from(buyerRequestsTable)
      .where(eq(buyerRequestsTable.status, "approved")),
    db.select({ count: sql<number>`count(*)::int` }).from(sellerListingsTable)
      .where(eq(sellerListingsTable.status, "approved")),
    db.select({ count: sql<number>`count(*)::int` }).from(dealsTable)
      .where(sql`${dealsTable.status} not in ('completed','cancelled','rejected')`),
    db.select({ count: sql<number>`count(*)::int` }).from(matchesTable)
      .where(eq(matchesTable.status, "suggested")),
    db.select({
      id: akifResearchRunsTable.id,
      product: akifResearchRunsTable.product,
      targetCountry: akifResearchRunsTable.targetCountry,
      direction: akifResearchRunsTable.direction,
      status: akifResearchRunsTable.status,
      createdAt: akifResearchRunsTable.createdAt,
      completedAt: akifResearchRunsTable.completedAt,
    }).from(akifResearchRunsTable)
      .orderBy(desc(akifResearchRunsTable.createdAt))
      .limit(10),
  ]);

  return {
    counts: {
      researchRuns: researchCount?.count ?? 0,
      completedResearchRuns: completedResearchCount?.count ?? 0,
      approvedBuyerRequirements: openBuyerCount?.count ?? 0,
      approvedSellerOffers: approvedSellerCount?.count ?? 0,
      activeDeals: activeDealCount?.count ?? 0,
      suggestedMatches: suggestedMatchCount?.count ?? 0,
    },
    recentResearch,
  };
}

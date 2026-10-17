import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, dealsTable, dealParticipantsTable } from "@workspace/db";

export function dealAccess(userId: string, role: string) {
  return role === "admin" ? sql`true` : or(
    eq(dealsTable.buyerUserId, userId),
    eq(dealsTable.sellerUserId, userId),
    inArray(
      dealsTable.id,
      db.select({ dealId: dealParticipantsTable.dealId })
        .from(dealParticipantsTable)
        .where(and(
          eq(dealParticipantsTable.userId, userId),
          eq(dealParticipantsTable.participantRole, "agent"),
          eq(dealParticipantsTable.status, "active"),
        )),
    ),
  );
}


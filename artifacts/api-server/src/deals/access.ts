import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, dealsTable, dealParticipantsTable } from "@workspace/db";

export function dealAccess(userId: string, role: string) {
  if (role === "admin") return sql`true`;
  // Principal access follows the identity recorded on the deal itself: a
  // buyer/seller keeps their own deal history across later role changes.
  const principal = or(
    eq(dealsTable.buyerUserId, userId),
    eq(dealsTable.sellerUserId, userId),
  );
  // An agent assignment grants access only while the account still IS an agent.
  // After a role change back to buyer/seller, the historical agent assignment
  // must not upgrade into principal-level access to confidential deal data
  // (prices, documents, messages, financials, unredacted tracking).
  if (role !== "agent") return principal;
  return or(
    principal,
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


import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  companiesTable,
  companyVerificationDocumentsTable,
} from "@workspace/db";

export async function verifiedCounterparties(
  buyerId: string,
  sellerId: string,
  executor: Pick<typeof db, "select"> = db,
) {
  const users = await executor
    .select()
    .from(usersTable)
    .where(
      and(
        inArray(usersTable.id, [buyerId, sellerId]),
        eq(usersTable.status, "verified"),
      ),
    );
  if (
    !users.some((u) => u.id === buyerId && u.role === "buyer") ||
    !users.some((u) => u.id === sellerId && u.role === "seller")
  )
    return false;
  const companies = await executor
    .select()
    .from(companiesTable)
    .where(
      and(
        inArray(companiesTable.ownerUserId, [buyerId, sellerId]),
        eq(companiesTable.verificationStatus, "verified"),
      ),
    );
  for (const id of [buyerId, sellerId]) {
    const owned = companies
      .filter((c) => c.ownerUserId === id)
      .map((c) => c.id);
    if (!owned.length) return false;
    const [evidence] = await executor
      .select({ id: companyVerificationDocumentsTable.id })
      .from(companyVerificationDocumentsTable)
      .where(
        and(
          inArray(companyVerificationDocumentsTable.companyId, owned),
          eq(companyVerificationDocumentsTable.status, "approved"),
        ),
      )
      .limit(1);
    if (!evidence) return false;
  }
  return true;
}

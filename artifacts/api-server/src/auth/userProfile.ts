import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { companiesTable, usersTable } from "@workspace/db";

export const safeUserSelection = {
  id: usersTable.id,
  email: usersTable.email,
  phone: usersTable.phone,
  fullName: usersTable.fullName,
  role: usersTable.role,
  status: usersTable.status,
} as const;

export async function getSafeUserProfile(userId: string) {
  const [user] = await db
    .select(safeUserSelection)
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return undefined;

  const [company] = await db
    .select({
      id: companiesTable.id,
      ownerUserId: companiesTable.ownerUserId,
      companyName: companiesTable.companyName,
      registrationNumber: companiesTable.registrationNumber,
      country: companiesTable.country,
      address: companiesTable.address,
      website: companiesTable.website,
      verificationStatus: companiesTable.verificationStatus,
      createdAt: companiesTable.createdAt,
      updatedAt: companiesTable.updatedAt,
    })
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId))
    .orderBy(desc(companiesTable.createdAt))
    .limit(1);

  return { ...user, company: company ?? null };
}
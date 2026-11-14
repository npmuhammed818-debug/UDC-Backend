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
  for(const id of [buyerId,sellerId])if(!await approvedCompanyEvidence(id,executor))return false;
  return true;
}

export async function approvedCompanyEvidence(userId:string,executor:Pick<typeof db,'select'>=db,companyId?:string,lockEvidence=false){
  const companyQuery=executor.select({id:companiesTable.id}).from(companiesTable).where(and(eq(companiesTable.ownerUserId,userId),eq(companiesTable.verificationStatus,'verified'),...(companyId?[eq(companiesTable.id,companyId)]:[])));
  const companies=await (lockEvidence?companyQuery.for('share'):companyQuery);
  if(!companies.length)return false;
  const evidenceQuery=executor.select({id:companyVerificationDocumentsTable.id}).from(companyVerificationDocumentsTable).where(and(inArray(companyVerificationDocumentsTable.companyId,companies.map(c=>c.id)),eq(companyVerificationDocumentsTable.status,'approved'))).limit(1);
  const [evidence]=await (lockEvidence?evidenceQuery.for('share'):evidenceQuery);
  return Boolean(evidence);
}

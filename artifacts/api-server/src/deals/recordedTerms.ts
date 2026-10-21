import { and, eq } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import type { matchTerms } from "../marketplace/termAgreement";

// Immutable deal-time snapshot; later listing edits must not rewrite agreed terms.
export async function recordedDealTerms(
  dealId: string,
  executor: Pick<typeof db, "select"> = db,
) {
  const [event] = await executor
    .select()
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityId, dealId),
        eq(auditLogsTable.action, "deal_created"),
      ),
    )
    .limit(1);
  const terms = (event?.metadata as any)?.agreedTerms;
  return terms && typeof terms.paymentTerms === "string"
    ? (terms as ReturnType<typeof matchTerms>)
    : null;
}

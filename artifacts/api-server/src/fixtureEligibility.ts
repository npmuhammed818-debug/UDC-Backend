import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import { db, usersTable, auditLogsTable, referralsTable, dealsTable, dealParticipantsTable, commissionsTable } from "@workspace/db";
import { isStagingEnv, fixtureUserIds, SYNTHETIC_EMAIL_SUFFIX } from "./testPrincipal.ts";

type Executor = Pick<typeof db, "select">;

/**
 * DB-backed proof that a registry-listed id is a genuine synthetic fixture and not a
 * misconfigured real account. The env registry (UDC_TEST_FIXTURE_IDS) alone NEVER
 * grants fixture status: the user row must carry the fixture shape - reserved
 * @udc-test.invalid email, no phone, password recovery disabled - AND a creation
 * provenance audit row written by POST /admin/owner-test/fixtures. A real account
 * can never satisfy this (the reserved domain is not registerable, and the
 * provenance row only exists for provisioned fixtures), so genuine verification
 * requirements can never be bypassed by pointing the env var at a real id.
 *
 * Use this at every ALLOWANCE point (documentless counterparty eligibility,
 * documentless verified status). Blocking checks (assertSameWorld / sameWorldIds)
 * stay id-based and fail closed without a db round trip.
 */
export async function provenFixtureIds(
  ids: (string | null | undefined)[],
  executor: Executor = db,
): Promise<Set<string>> {
  if (!isStagingEnv()) return new Set();
  const candidates = [...new Set(
    ids.filter((id): id is string => Boolean(id)).map((id) => id.toLowerCase())
      .filter((id) => fixtureUserIds().includes(id)),
  )];
  if (!candidates.length) return new Set();
  const rows = await executor
    .select({
      id: usersTable.id,
      email: usersTable.email,
      phone: usersTable.phone,
      passwordRecoveryEnabled: usersTable.passwordRecoveryEnabled,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, candidates));
  const shaped = rows.filter((row) =>
    typeof row.email === "string" &&
    row.email.toLowerCase().endsWith(SYNTHETIC_EMAIL_SUFFIX) &&
    !row.phone &&
    row.passwordRecoveryEnabled === false,
  );
  if (!shaped.length) return new Set();
  const provenance = await executor
    .select({ entityId: auditLogsTable.entityId })
    .from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.action, "owner_test_fixture_created"),
      inArray(auditLogsTable.entityId, shaped.map((row) => row.id)),
    ));
  return new Set(provenance.map((row) => row.entityId).filter((id): id is string => Boolean(id)));
}

const OPEN_DEAL_STATUSES = ["completed", "cancelled", "rejected"];
const OPEN_REWARD_STATUSES = ["paid", "cancelled"];

/**
 * Every counterparty id linked to a user through a non-terminal obligation:
 * referrals (either seat), deals (buyer/seller/agent columns), active deal
 * participations, and open commissions. Used before granting documentless
 * verified status to a test-world account: any link to an opposite-world
 * party means a planted or historical mixed obligation, and enabling must
 * fail instead of letting guards fight existing rows.
 */
export async function obligationCounterpartIds(
  userId: string,
  executor: Executor = db,
): Promise<string[]> {
  const counterparts = new Set<string>();
  const referrals = await executor
    .select({ agentUserId: referralsTable.agentUserId, referredUserId: referralsTable.referredUserId })
    .from(referralsTable)
    .where(and(
      or(eq(referralsTable.agentUserId, userId), eq(referralsTable.referredUserId, userId)),
      notInArray(referralsTable.status, OPEN_REWARD_STATUSES),
    ));
  for (const row of referrals) {
    counterparts.add(row.agentUserId === userId ? row.referredUserId : row.agentUserId);
  }
  const deals = await executor
    .select({ buyerUserId: dealsTable.buyerUserId, sellerUserId: dealsTable.sellerUserId })
    .from(dealsTable)
    .where(and(
      or(eq(dealsTable.buyerUserId, userId), eq(dealsTable.sellerUserId, userId), eq(dealsTable.agentId, userId)),
      notInArray(dealsTable.status, OPEN_DEAL_STATUSES),
    ));
  const dealIds = new Set<string>();
  for (const row of deals) {
    counterparts.add(row.buyerUserId);
    counterparts.add(row.sellerUserId);
  }
  const participations = await executor
    .select({ dealId: dealParticipantsTable.dealId })
    .from(dealParticipantsTable)
    .where(and(eq(dealParticipantsTable.userId, userId), eq(dealParticipantsTable.status, "active")));
  for (const row of participations) dealIds.add(row.dealId);
  const commissions = await executor
    .select({ dealId: commissionsTable.dealId })
    .from(commissionsTable)
    .where(and(eq(commissionsTable.beneficiaryUserId, userId), notInArray(commissionsTable.status, OPEN_REWARD_STATUSES)));
  for (const row of commissions) dealIds.add(row.dealId);
  const remainingDealIds = [...dealIds];
  if (remainingDealIds.length) {
    const linkedDeals = await executor
      .select({ buyerUserId: dealsTable.buyerUserId, sellerUserId: dealsTable.sellerUserId })
      .from(dealsTable)
      .where(and(inArray(dealsTable.id, remainingDealIds), notInArray(dealsTable.status, OPEN_DEAL_STATUSES)));
    for (const row of linkedDeals) {
      counterparts.add(row.buyerUserId);
      counterparts.add(row.sellerUserId);
    }
  }
  counterparts.delete(userId);
  return [...counterparts].filter(Boolean);
}

import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import { db, usersTable, auditLogsTable, referralsTable, dealsTable, dealParticipantsTable, commissionsTable, buyerPoolAllocationsTable, buyerPoolsTable, buyerRequestsTable, sellerListingsTable, matchesTable, dealMeetingsTable } from "@workspace/db";
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
  opts: { includeTerminal?: boolean } = {},
): Promise<string[]> {
  // includeTerminal=false: active/non-terminal obligations only (switch-role probe).
  // includeTerminal=true: full historic linkage - every row ever tying this user to
  // a counterparty, any status, including buyer-pool allocations through their pool's
  // deal. Owner/fixture classification is ID-stable and role/status-independent, so
  // pre-enable must rule out mixed HISTORY, not only open work.
  const open = !opts.includeTerminal;
  const counterparts = new Set<string>();
  const referrals = await executor
    .select({ agentUserId: referralsTable.agentUserId, referredUserId: referralsTable.referredUserId })
    .from(referralsTable)
    .where(open
      ? and(
          or(eq(referralsTable.agentUserId, userId), eq(referralsTable.referredUserId, userId)),
          notInArray(referralsTable.status, OPEN_REWARD_STATUSES),
        )
      : or(eq(referralsTable.agentUserId, userId), eq(referralsTable.referredUserId, userId)));
  for (const row of referrals) {
    counterparts.add(row.agentUserId === userId ? row.referredUserId : row.agentUserId);
  }
  const dealIds = new Set<string>();
  const collectDeal = (row: { buyerUserId: string | null; sellerUserId: string | null }, id?: string | null) => {
    if (row.buyerUserId) counterparts.add(row.buyerUserId);
    if (row.sellerUserId) counterparts.add(row.sellerUserId);
    if (id) dealIds.add(id);
  };
  const deals = await executor
    .select({ id: dealsTable.id, buyerUserId: dealsTable.buyerUserId, sellerUserId: dealsTable.sellerUserId })
    .from(dealsTable)
    .where(open
      ? and(
          or(eq(dealsTable.buyerUserId, userId), eq(dealsTable.sellerUserId, userId), eq(dealsTable.agentId, userId)),
          notInArray(dealsTable.status, OPEN_DEAL_STATUSES),
        )
      : or(eq(dealsTable.buyerUserId, userId), eq(dealsTable.sellerUserId, userId), eq(dealsTable.agentId, userId)));
  for (const row of deals) collectDeal(row);
  const participations = await executor
    .select({ dealId: dealParticipantsTable.dealId })
    .from(dealParticipantsTable)
    .where(open
      ? and(eq(dealParticipantsTable.userId, userId), eq(dealParticipantsTable.status, "active"))
      : eq(dealParticipantsTable.userId, userId));
  for (const row of participations) dealIds.add(row.dealId);
  const commissions = await executor
    .select({ dealId: commissionsTable.dealId })
    .from(commissionsTable)
    .where(open
      ? and(eq(commissionsTable.beneficiaryUserId, userId), notInArray(commissionsTable.status, OPEN_REWARD_STATUSES))
      : eq(commissionsTable.beneficiaryUserId, userId));
  for (const row of commissions) dealIds.add(row.dealId);
  // Matches and meetings tie the user to counterparties without an obligation status:
  // every match on the user's requests/listings links the other side's owner, and every
  // meeting the user requested/scheduled (or that sits on the user's deals) links its
  // attendees. Counted in both modes - a planted match is a live crossing, not history.
  const asBuyer = await executor
    .select({ counterpart: sellerListingsTable.sellerUserId })
    .from(matchesTable)
    .innerJoin(buyerRequestsTable, eq(matchesTable.buyerRequestId, buyerRequestsTable.id))
    .innerJoin(sellerListingsTable, eq(matchesTable.sellerListingId, sellerListingsTable.id))
    .where(eq(buyerRequestsTable.buyerUserId, userId));
  for (const row of asBuyer) if (row.counterpart) counterparts.add(row.counterpart);
  const asSeller = await executor
    .select({ counterpart: buyerRequestsTable.buyerUserId })
    .from(matchesTable)
    .innerJoin(sellerListingsTable, eq(matchesTable.sellerListingId, sellerListingsTable.id))
    .innerJoin(buyerRequestsTable, eq(matchesTable.buyerRequestId, buyerRequestsTable.id))
    .where(eq(sellerListingsTable.sellerUserId, userId));
  for (const row of asSeller) if (row.counterpart) counterparts.add(row.counterpart);
  const myMeetings = await executor
    .select({ dealId: dealMeetingsTable.dealId, requestedBy: dealMeetingsTable.requestedBy, scheduledBy: dealMeetingsTable.scheduledBy })
    .from(dealMeetingsTable)
    .where(or(eq(dealMeetingsTable.requestedBy, userId), eq(dealMeetingsTable.scheduledBy, userId)));
  for (const row of myMeetings) {
    if (row.requestedBy) counterparts.add(row.requestedBy);
    if (row.scheduledBy) counterparts.add(row.scheduledBy);
    dealIds.add(row.dealId);
  }
  if (!open) {
    const allocations = await executor
      .select({ dealId: buyerPoolsTable.dealId })
      .from(buyerPoolAllocationsTable)
      .innerJoin(buyerPoolsTable, eq(buyerPoolAllocationsTable.poolId, buyerPoolsTable.id))
      .where(eq(buyerPoolAllocationsTable.buyerUserId, userId));
    for (const row of allocations) dealIds.add(row.dealId);
  }
  const remainingDealIds = [...dealIds];
  if (remainingDealIds.length) {
    const linkedDeals = await executor
      .select({ buyerUserId: dealsTable.buyerUserId, sellerUserId: dealsTable.sellerUserId })
      .from(dealsTable)
      .where(open
        ? and(inArray(dealsTable.id, remainingDealIds), notInArray(dealsTable.status, OPEN_DEAL_STATUSES))
        : inArray(dealsTable.id, remainingDealIds));
    for (const row of linkedDeals) collectDeal(row);
  }
  counterparts.delete(userId);
  return [...counterparts].filter(Boolean).sort();
}

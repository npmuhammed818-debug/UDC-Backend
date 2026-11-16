import { isOwnerTestPrincipal, isStagingEnv, isTestPrincipal, isTestWorldId, type PrincipalLike } from "./testPrincipal.ts";

export const TEST_BOUNDARY_ERROR = "test_boundary_crossing";

/** Thrown when a write would link the isolated owner-test world with real accounts. */
export class TestBoundaryError extends Error {
  constructor() {
    super(TEST_BOUNDARY_ERROR);
    this.name = "TestBoundaryError";
  }
}

/**
 * Hard isolation rule for cross-party writes: the staging owner-test world (the owner
 * test account plus the registered synthetic fixtures) never mixes with real accounts,
 * in either direction. Id-based on purpose: role and status change during the owner
 * test (that is its point), and the boundary must not move when they do.
 *
 * Use this at every write that pairs two parties (referrals, matches, deals, pool
 * allocations, commissions, agent assignments, message relays). Read-side matching
 * uses the same isTestWorldId split so a test request never surfaces to a real
 * seller and a real request never reaches a test fixture.
 */
export function assertSameWorld(...ids: (string | null | undefined)[]): void {
  const present = ids.filter((id): id is string => Boolean(id));
  if (present.length < 2) return;
  const first = isTestWorldId(present[0]);
  if (!present.every((id) => isTestWorldId(id) === first)) throw new TestBoundaryError();
}

/**
 * Test-world branch classification for counterparty checks (pure, DB-free):
 *  - null: neither side is in the test world - run the normal verified-plus-evidence path;
 *  - false: mixed pair (one real, one test-world) - fail closed, never verified counterparties;
 *  - true: both sides test-world - the caller must still check the loaded rows with
 *    testWorldCounterpartyRowsOk (verified status, roles, full principal identity).
 */
export function testWorldPair(buyerId: string, sellerId: string): boolean | null {
  if (!isStagingEnv() || (!isTestWorldId(buyerId) && !isTestWorldId(sellerId))) return null;
  return isTestWorldId(buyerId) && isTestWorldId(sellerId);
}

export type CounterpartyRow = PrincipalLike & { role?: string | null; status?: string | null };

/** Both-sides-test-world pairs trade without company evidence, but only as verified
 *  buyer/seller rows whose full identity is a test principal (owner needs id AND phone;
 *  fixtures need registry membership). When `proven` is given (the DB-backed eligibility
 *  proof from provenFixtureIds), fixture membership must come from that set - the env
 *  registry alone is then not enough. */
export function testWorldCounterpartyRowsOk(
  users: CounterpartyRow[],
  buyerId: string,
  sellerId: string,
  proven?: Set<string>,
): boolean {
  const eligible = (u: CounterpartyRow) => isOwnerTestPrincipal(u) || (proven ? proven.has((u.id ?? "").toLowerCase()) : isTestPrincipal(u));
  return (
    users.some((u) => u.id === buyerId && u.role === "buyer" && u.status === "verified" && eligible(u)) &&
    users.some((u) => u.id === sellerId && u.role === "seller" && u.status === "verified" && eligible(u))
  );
}

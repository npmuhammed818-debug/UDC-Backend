/** Owner test mode identity. Hard-coded on purpose: it must not widen when an env setting changes.
 *  A test principal exists ONLY in staging. Outside staging every check returns false (fail closed),
 *  so a test account can never be treated as a special account in production. */
export const OWNER_TEST_USER_ID = "30b6dc9b-8409-4b43-9b81-05e5f2869321";
export const OWNER_TEST_PHONE_DIGITS = "917994133604";
/** Synthetic fixtures are accounts whose email uses the reserved .invalid domain (never deliverable). */
export const SYNTHETIC_EMAIL_SUFFIX = "@udc-test.invalid";

export type PrincipalLike = { id?: string | null; phone?: string | null; email?: string | null };
const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");
export const isStagingEnv = () => process.env.UDC_APP_ENV === "staging";

export function isOwnerTestPrincipal(u: PrincipalLike | null | undefined): boolean {
  return !!u && isStagingEnv() && u.id === OWNER_TEST_USER_ID && digits(u.phone) === OWNER_TEST_PHONE_DIGITS;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Explicit registry of synthetic fixture account ids (staging only), from UDC_TEST_FIXTURE_IDS
 *  (comma-separated). Fixture identity comes ONLY from this registry: an email suffix or a name
 *  never makes an account a fixture, and the owner test account itself is never a fixture.
 *  Outside staging the registry is always empty (fail closed). */
export function fixtureUserIds(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!isStagingEnv()) return [];
  return (env.UDC_TEST_FIXTURE_IDS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => UUID_RE.test(value) && value !== OWNER_TEST_USER_ID);
}

export function isSyntheticFixture(u: PrincipalLike | null | undefined): boolean {
  return !!u?.id && fixtureUserIds().includes(u.id.toLowerCase());
}
/** The owner-test switch stays off unless this explicit server flag is set to 1 (unset = disabled). */
export const ownerTestSwitchEnabled = () => isStagingEnv() && process.env.UDC_OWNER_TEST_SWITCH === "1";
export const isTestPrincipal = (u: PrincipalLike | null | undefined) => isOwnerTestPrincipal(u) || isSyntheticFixture(u);

/** True when an interaction would cross between a test principal and a real one (either direction). */
export function crossesTestBoundary(a: PrincipalLike | null | undefined, b: PrincipalLike | null | undefined): boolean {
  return isTestPrincipal(a) !== isTestPrincipal(b);
}

/** Id-only test-world membership (the owner test account plus the fixture registry).
 *  Deliberately independent of role and status: the owner test switches roles and gets a
 *  verified status, and the boundary must hold unchanged through all of it.
 *  Fail closed outside staging. */
export function isTestWorldId(id: string | null | undefined): boolean {
  if (!id || !isStagingEnv()) return false;
  const normalized = id.toLowerCase();
  return normalized === OWNER_TEST_USER_ID || fixtureUserIds().includes(normalized);
}

/** True when every given id belongs to the same world (all test-world or all real). */
export function sameWorldIds(...ids: (string | null | undefined)[]): boolean {
  const present = ids.filter((id): id is string => Boolean(id));
  if (present.length < 2) return true;
  const first = isTestWorldId(present[0]);
  return present.every((id) => isTestWorldId(id) === first);
}

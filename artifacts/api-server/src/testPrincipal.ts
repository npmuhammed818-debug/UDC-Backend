/** Owner test mode identity. Hard-coded on purpose: it must not widen when an env setting changes.
 *  A test principal exists ONLY in staging. Outside staging every check returns false (fail closed),
 *  so a test account can never be treated as a special account in production. */
export const OWNER_TEST_USER_ID = "30b6dc9b-8409-4b43-9b81-05e5f2869321";
export const OWNER_TEST_PHONE_DIGITS = "917994133604";
/** Synthetic fixtures are accounts whose email uses the reserved .invalid domain (never deliverable). */
export const SYNTHETIC_EMAIL_SUFFIX = "@udc-test.invalid";

type PrincipalLike = { id?: string | null; phone?: string | null; email?: string | null };
const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");
export const isStagingEnv = () => process.env.UDC_APP_ENV === "staging";

export function isOwnerTestPrincipal(u: PrincipalLike | null | undefined): boolean {
  return !!u && isStagingEnv() && u.id === OWNER_TEST_USER_ID && digits(u.phone) === OWNER_TEST_PHONE_DIGITS;
}
export function isSyntheticFixture(u: PrincipalLike | null | undefined): boolean {
  return !!u && isStagingEnv() && (u.email ?? "").toLowerCase().endsWith(SYNTHETIC_EMAIL_SUFFIX);
}
export const isTestPrincipal = (u: PrincipalLike | null | undefined) => isOwnerTestPrincipal(u) || isSyntheticFixture(u);

/** True when an interaction would cross between a test principal and a real one (either direction). */
export function crossesTestBoundary(a: PrincipalLike | null | undefined, b: PrincipalLike | null | undefined): boolean {
  return isTestPrincipal(a) !== isTestPrincipal(b);
}

// Per-account password-login budget: caps total guesses against one account even
// when the attacker rotates IPs (the per-IP limit in rateLimit.ts cannot).
// Pure logic lives here so it can be tested without loading the database layer.
export const PASSWORD_LOGIN_LIMIT = 10;
export const PASSWORD_LOGIN_WINDOW_MS = 30 * 60_000;
// Safety net across networks: even a botnet rotating IPs gets at most this
// many password proofs per account per day.
export const PASSWORD_LOGIN_DAILY_LIMIT = 30;
export const PASSWORD_LOGIN_DAILY_WINDOW_MS = 24 * 60 * 60_000;
export function windowLimitExceeded(
  row: { count: number; windowStartMs: number } | undefined,
  nowMs: number,
  windowMs: number,
  limit: number,
): boolean {
  if (!row) return false;
  if (nowMs - row.windowStartMs >= windowMs) return false; // window expired: fresh
  return row.count >= limit;
}

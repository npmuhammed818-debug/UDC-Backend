// TESTER MODE (owner request, 28 Oct): staging-only shortcuts for the owner's
// own test number - skip the email code at registration/sign-in and switch
// roles freely. Hard gates, ALL required before anything changes:
//   UDC_APP_ENV=staging (explicit positive check - unset, production or any
//   other value refuses), UDC_TESTER_MODE=on, and the number listed in
//   UDC_TESTER_PHONES (digits). Staging runs NODE_ENV=production on purpose,
//   so NODE_ENV is NOT a gate here; UDC_APP_ENV alone decides the environment.
// Off by default. Impossible in production: a production (or missing)
// UDC_APP_ENV turns every check off. No effect on any other number.

export function normalizeTesterPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isTesterModeEnabled(): boolean {
  if (process.env.UDC_APP_ENV !== 'staging') return false;
  return process.env.UDC_TESTER_MODE === 'on';
}

export function testerPhones(): string[] {
  return (process.env.UDC_TESTER_PHONES ?? '').split(',').map(normalizeTesterPhone).filter(Boolean);
}

export function isTesterPhone(phone: string | null | undefined): boolean {
  if (!phone || !isTesterModeEnabled()) return false;
  return testerPhones().includes(normalizeTesterPhone(phone));
}

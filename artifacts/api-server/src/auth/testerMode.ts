// TESTER MODE (owner request, 28 Oct): staging-only shortcuts for the owner's
// own test number - skip the email code at registration/sign-in and switch
// roles freely. Hard gates, ALL required before anything changes:
//   UDC_TESTER_MODE=on, NODE_ENV not production, UDC_APP_ENV not production,
//   and the number listed in UDC_TESTER_PHONES (digits).
// Off by default. Impossible in production: any production marker turns every
// check off, whatever the other variables say. No effect on any other number.

export function normalizeTesterPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isTesterModeEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.UDC_APP_ENV === 'production') return false;
  return process.env.UDC_TESTER_MODE === 'on';
}

export function testerPhones(): string[] {
  return (process.env.UDC_TESTER_PHONES ?? '').split(',').map(normalizeTesterPhone).filter(Boolean);
}

export function isTesterPhone(phone: string | null | undefined): boolean {
  if (!phone || !isTesterModeEnabled()) return false;
  return testerPhones().includes(normalizeTesterPhone(phone));
}

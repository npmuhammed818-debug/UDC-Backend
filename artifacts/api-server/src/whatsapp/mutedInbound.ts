// Owner freeze: numbers listed in UDC_MUTED_PHONES (digits, comma separated) get
// no automated reply, typing indicator, AI turn or watchdog message. The inbound
// is still logged (phone tail, type, time) so the owner can read it elsewhere.
export function isMutedPhone(phone: string | undefined | null): boolean {
  if (!phone) return false;
  const d = String(phone).replace(/\D/g, "");
  return (process.env.UDC_MUTED_PHONES ?? "").split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean).includes(d);
}

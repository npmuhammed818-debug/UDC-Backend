export const HOLDING_REPLY = "Traffic is very high right now. Access is currently invite only and all open positions are full. We will announce when new spots open.";

export const digits = (p: string) => String(p ?? "").replace(/\D/g, "");

export function inviteOnlyOn(env = process.env): boolean {
  return /^(on|1|true|yes)$/i.test(env.UDC_INVITE_ONLY ?? "");
}
export function isAllowedPhone(phone: string, env = process.env): boolean {
  const d = digits(phone);
  return (env.UDC_ALLOWED_PHONES ?? "").split(",").map(digits).filter(Boolean).includes(d);
}

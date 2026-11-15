// Test-scope freeze. When UDC_WHATSAPP_ONLY_TO is set (digits, comma separated),
// NO WhatsApp message, reaction, typing/read signal or template goes to any other
// number. Unset means no restriction. Every outbound path checks this.
export const outboundScopeList = (env: NodeJS.ProcessEnv = process.env): string[] | null => {
  const raw = env.UDC_WHATSAPP_ONLY_TO;
  if (raw === undefined || raw.trim() === "") return null;
  return raw.split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
};

/** true when sending to this recipient is allowed under the current scope. */
export const outboundAllowed = (to: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean => {
  const list = outboundScopeList(env);
  if (list === null) return true;
  const digits = String(to ?? "").replace(/\D/g, "");
  return digits.length > 0 && list.includes(digits);
};

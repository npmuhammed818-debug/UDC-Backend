import { createHmac, timingSafeEqual } from 'node:crypto';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function signature(agentId: string, secret: string) {
  if (secret.length < 16) throw new Error('referral_signing_unavailable');
  // Purpose separation: this signature cannot be used as a Meta webhook signature.
  return createHmac('sha256', secret).update('UDC_REFERRAL_V1:' + agentId).digest('base64url');
}
export function createAgentInvitation(agentId: string, secret: string) {
  if (!uuid.test(agentId)) throw new Error('invalid_agent_id');
  return `v1.${agentId}.${signature(agentId, secret)}`;
}
export function verifyAgentInvitation(token: string, secret: string) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !uuid.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return null;
  try {
    const expected = Buffer.from(signature(parts[1], secret));
    const supplied = Buffer.from(parts[2]);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? parts[1] : null;
  } catch { return null; }
}
// A short, stable code is easier to share in WhatsApp. The first 12 UUID
// characters provide 48 bits of uniqueness; the handler rejects collisions.
export function agentReferralCode(agentId: string) {
  return `UDC-${agentId.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

/** Copy-ready WhatsApp message; the recipient must consent and confirm. */
export function agentReferralWhatsAppCommand(agentId:string){
  if(!uuid.test(agentId))throw Error("invalid_agent_id");
  return "Referral "+agentReferralCode(agentId);
}

/**
 * Optional human-facing wa.me convenience link for the registered UDC
 * business number, NOT Meta's WHATSAPP_PHONE_NUMBER_ID (a numeric resource ID).
 * Never create a link when the public number is not explicitly configured.
 */
export function agentReferralWhatsAppLink(agentId:string, publicNumber:unknown){
  if(!uuid.test(agentId))return null;
  if(typeof publicNumber!=="string" || !/^\+?[1-9]\d{7,14}$/.test(publicNumber))return null;
  const to=publicNumber.replace(/^\+/,"");
  return `https://wa.me/${to}?text=${encodeURIComponent(agentReferralWhatsAppCommand(agentId))}`;
}

// src/referrals/invitation.ts
var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function agentReferralCode(agentId) {
  return `UDC-${agentId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
function agentReferralWhatsAppCommand(agentId) {
  if (!uuid.test(agentId)) throw Error("invalid_agent_id");
  return "Referral " + agentReferralCode(agentId);
}
function agentReferralWhatsAppLink(agentId, publicNumber) {
  if (!uuid.test(agentId)) return null;
  if (typeof publicNumber !== "string" || !/^\+?[1-9]\d{7,14}$/.test(publicNumber)) return null;
  const to = publicNumber.replace(/^\+/, "");
  return `https://wa.me/${to}?text=${encodeURIComponent(agentReferralWhatsAppCommand(agentId))}`;
}
export {
  agentReferralCode,
  agentReferralWhatsAppCommand,
  agentReferralWhatsAppLink
};

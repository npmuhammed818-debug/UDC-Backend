// Pure helpers for the personal agent invite link (wa.me ... ?text=JOIN <code>).
import { agentReferralCode } from "./invitation.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODE = "UDC-[A-Fa-f0-9]{12}";

export function agentJoinCommand(agentId: string) {
  if (!uuid.test(agentId)) throw new Error("invalid_agent_id");
  return `JOIN ${agentReferralCode(agentId)}`;
}

// Same safety rules as the existing referral link: only an explicitly configured public number.
export function agentJoinLink(agentId: string, publicNumber: unknown) {
  if (!uuid.test(agentId)) return null;
  if (typeof publicNumber !== "string" || !/^\+?[1-9]\d{7,14}$/.test(publicNumber)) return null;
  return `https://wa.me/${publicNumber.replace(/^\+/, "")}?text=${encodeURIComponent(agentJoinCommand(agentId))}`;
}

// "JOIN UDC-XXXXXXXXXXXX" or a bare code. Returns the upper-case code, or null.
export function parseJoinCode(text: unknown): string | null {
  if (typeof text !== "string" || text.length > 60) return null;
  const m = new RegExp(`^\\s*(?:join\\s+)?(${CODE})\\s*$`, "i").exec(text);
  return m ? m[1]!.toUpperCase() : null;
}

export function isInviteDecline(text: unknown) {
  return typeof text === "string" && /^\s*(?:no|nope|nobody|none|no one|no thanks)[.!]?\s*$/i.test(text);
}

export const INVITE_QUESTION =
  "One quick question: did anyone invite you to UDC? If yes, send their invite code (it looks like UDC-XXXXXXXXXXXX). If not, just reply No.";

export function invitedByGreeting(agentName: string | null | undefined) {
  const name = (agentName ?? "").trim();
  return name ? `You were invited by ${name}.` : "You were invited by a UDC agent.";
}

// Agents see a masked name only.
export function maskName(name: string | null | undefined) {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? `${first.slice(0, 1).toUpperCase()}${"*".repeat(Math.min(Math.max(first.length - 1, 2), 6))}` : "Member";
}

const STAGES: Record<string, string> = {
  pending: "in review", under_review: "in review", active: "in progress", in_progress: "in progress",
  completed: "completed", closed: "completed", cancelled: "cancelled", disputed: "needs UDC attention",
};
// Redacted stage only: never prices, quantities, parties or documents.
export function redactedStage(status: string | null | undefined) {
  return STAGES[String(status ?? "").toLowerCase()] ?? "in progress";
}

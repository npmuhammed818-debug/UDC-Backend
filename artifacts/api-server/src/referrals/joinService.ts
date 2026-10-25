import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { auditLogsTable, dealParticipantsTable, dealsTable, db, notificationsTable, referralsTable, usersTable } from "@workspace/db";
import { guidedChatPhoneHash } from "../whatsapp/phoneFingerprint";
import { agentReferralCode } from "./invitation";
import { INVITE_QUESTION, invitedByGreeting, isInviteDecline, maskName, parseJoinCode, redactedStage } from "./joinInvite";

type Exec = Pick<typeof db, "select" | "insert" | "update">;
const WEEK = 7 * 24 * 60 * 60_000;

async function resolveAgent(exec: Exec, code: string) {
  const prefix = code.replace(/^UDC-/i, "").toLowerCase();
  const rows = await exec.select().from(usersTable)
    .where(and(sql`replace(${usersTable.id}::text,'-','') LIKE ${prefix + "%"}`, eq(usersTable.role, "agent"), eq(usersTable.status, "verified"))).limit(2);
  return rows.length === 1 ? rows[0]! : null;
}

async function attribute(exec: Exec, user: { id: string; role: string }, agent: { id: string }, via: string) {
  const [existing] = await exec.select({ id: referralsTable.id }).from(referralsTable).where(eq(referralsTable.referredUserId, user.id)).limit(1);
  if (existing) return false;
  await exec.insert(referralsTable).values({ agentUserId: agent.id, referredUserId: user.id, referralCode: agentReferralCode(agent.id), status: "pending" });
  await exec.insert(auditLogsTable).values({ actorUserId: user.id, action: "whatsapp_invite_attributed", entityType: "user", entityId: user.id,
    metadata: { agentUserId: agent.id, via, requiresAdminReview: true } });
  // In-app notification only: a proactive WhatsApp message needs an approved template outside the 24h window.
  await exec.insert(notificationsTable).values({ userId: agent.id, type: "referral_joined", title: "Your referral joined",
    body: `A new ${user.role} joined UDC through your invite. Status: pending UDC review. No commission is agreed automatically.`, link: "/referrals" });
  return true;
}

// Registered buyer/seller sends JOIN <code>, or an unregistered number sends it first.
export async function handleJoinMessage(phone: string, text: string | undefined) {
  const code = parseJoinCode(text);
  if (!code) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  const agent = await resolveAgent(db, code);
  if (!agent || agent.id === user?.id) return "That invite code is not available. Ask the agent to send you their current link.";
  const greeting = invitedByGreeting(agent.fullName);
  if (!user) {
    await db.insert(auditLogsTable).values({ actorUserId: null, action: "whatsapp_invite_pending", entityType: "invite", entityId: null,
      metadata: { phoneHash: guidedChatPhoneHash(phone), agentUserId: agent.id, expiresAt: new Date(Date.now() + WEEK).toISOString() } });
    return `${greeting} Send Menu to register as a buyer or seller. I will attach the invitation when you finish (kept for 7 days). It does not agree any commission.`;
  }
  if (!["buyer", "seller"].includes(user.role) || ["suspended", "rejected"].includes(user.status)) return "Invites apply to buyer and seller accounts.";
  const added = await attribute(db, user, agent, "join_link");
  return added
    ? `${greeting} Your introduction is recorded for UDC review. No commission or deal access is agreed automatically.`
    : "An introduction is already recorded for your account. Ask UDC to review any correction.";
}

// Called inside the registration transaction for a new buyer/seller.
export async function claimInviteAfterRegistration(exec: Exec, phone: string, user: { id: string; role: string }) {
  const hash = guidedChatPhoneHash(phone);
  const [pending] = await exec.select().from(auditLogsTable).where(and(eq(auditLogsTable.action, "whatsapp_invite_pending"),
    sql`${auditLogsTable.metadata}->>'phoneHash' = ${hash}`, sql`(${auditLogsTable.metadata}->>'expiresAt')::timestamptz > now()`))
    .orderBy(desc(auditLogsTable.createdAt)).limit(1);
  if (pending) {
    const agentId = (pending.metadata as { agentUserId?: string }).agentUserId;
    const [agent] = agentId ? await exec.select().from(usersTable).where(and(eq(usersTable.id, agentId), eq(usersTable.role, "agent"), eq(usersTable.status, "verified"))).limit(1) : [];
    if (agent && await attribute(exec, user, agent, "join_link_after_registration")) return `${invitedByGreeting(agent.fullName)} Your introduction is recorded for UDC review.`;
  }
  const [referred] = await exec.select({ id: referralsTable.id }).from(referralsTable).where(eq(referralsTable.referredUserId, user.id)).limit(1);
  if (referred) return null;
  const [asked] = await exec.select({ id: auditLogsTable.id }).from(auditLogsTable).where(and(eq(auditLogsTable.actorUserId, user.id), eq(auditLogsTable.action, "whatsapp_invite_question_asked"))).limit(1);
  if (asked) return null;
  await exec.insert(auditLogsTable).values({ actorUserId: user.id, action: "whatsapp_invite_question_asked", entityType: "user", entityId: user.id, metadata: {} });
  return INVITE_QUESTION; // asked once
}

// "No" after the one-time question closes it; a code is handled by handleJoinMessage.
export async function handleInviteDecline(phone: string, text: string | undefined) {
  if (!isInviteDecline(text)) return null;
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) return null;
  const [asked] = await db.select({ id: auditLogsTable.id, at: auditLogsTable.createdAt }).from(auditLogsTable)
    .where(and(eq(auditLogsTable.actorUserId, user.id), eq(auditLogsTable.action, "whatsapp_invite_question_asked"))).limit(1);
  if (!asked || Date.now() - new Date(asked.at).getTime() > 24 * 60 * 60_000) return null;
  const [done] = await db.select({ id: auditLogsTable.id }).from(auditLogsTable)
    .where(and(eq(auditLogsTable.actorUserId, user.id), eq(auditLogsTable.action, "whatsapp_invite_declined"))).limit(1);
  if (done) return null;
  await db.insert(auditLogsTable).values({ actorUserId: user.id, action: "whatsapp_invite_declined", entityType: "user", entityId: user.id, metadata: {} });
  return "No problem. You can add an agent's invite code later by sending it here.";
}

// "My invites": joined referrals with masked names and redacted stages only.
export async function myInvitesReply(agentUserId: string) {
  const refs = await db.select({ referredUserId: referralsTable.referredUserId, status: referralsTable.status, createdAt: referralsTable.createdAt })
    .from(referralsTable).where(eq(referralsTable.agentUserId, agentUserId)).orderBy(desc(referralsTable.createdAt)).limit(20);
  if (!refs.length) return "No one has joined through your invite yet.";
  const ids = refs.map(r => r.referredUserId);
  const people = await db.select({ id: usersTable.id, fullName: usersTable.fullName, role: usersTable.role }).from(usersTable).where(inArray(usersTable.id, ids));
  // Stages only for deals where this agent is an active agent participant (existing authorization).
  const deals = await db.select({ buyer: dealsTable.buyerUserId, seller: dealsTable.sellerUserId, status: dealsTable.status }).from(dealsTable)
    .where(and(inArray(dealsTable.id, db.select({ dealId: dealParticipantsTable.dealId }).from(dealParticipantsTable)
      .where(and(eq(dealParticipantsTable.userId, agentUserId), eq(dealParticipantsTable.participantRole, "agent"), eq(dealParticipantsTable.status, "active")))),
      or(inArray(dealsTable.buyerUserId, ids), inArray(dealsTable.sellerUserId, ids))));
  return refs.map(r => {
    const p = people.find(x => x.id === r.referredUserId);
    const stages = deals.filter(d => d.buyer === r.referredUserId || d.seller === r.referredUserId).map(d => redactedStage(d.status));
    return `${maskName(p?.fullName)} (${p?.role ?? "member"}) - referral ${r.status}${stages.length ? `; deals: ${[...new Set(stages)].join(", ")}` : ""}`;
  }).join("\n");
}

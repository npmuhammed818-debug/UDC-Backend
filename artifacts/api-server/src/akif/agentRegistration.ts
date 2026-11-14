import { randomUUID } from 'node:crypto';
import { emailAuth } from '../auth/emailAuth';
import { isTesterPhone } from '../auth/testerMode';
import { knownFactsForContact } from "./humanRelay";
import { queueAdminReviewAlert } from "../whatsapp/adminReviewAlerts";
import { and, eq, inArray, sql } from 'drizzle-orm';
import { auditLogsTable, db, notificationsTable, usersTable } from '@workspace/db';
import { hashPassword } from '../auth/passwords';

// The one OTP exemption (owner direction, 10 Nov): Sandra's existing account.
const OTP_EXEMPT_PHONE = "917028815509";

export function isAgentRegistrationRequest(text: string) {
  return /^(?:(?:please\s+)?register me as (?:an?\s+)?(?:agent|broker)|i (?:am|want to (?:join|register) as) (?:an?\s+)?(?:agent|broker)|i['’]m (?:an?\s+)?(?:agent|broker))[.!\s]*$/i.test(text.trim());
}

export async function registerWhatsAppAgent(phone: string, fullName?: string) {
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'agent_registration:' + phone}))`);
    const [existing] = await tx.select({ id: usersTable.id, role: usersTable.role, status: usersTable.status, email: usersTable.email }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (existing) {
      // Owner rule, 10 Nov: ONLY Sandra's existing account is exempt from OTP
      // collection. Every other existing account with an email on file confirms
      // it with a code, same as a new registration.
      const reply = existing.role !== 'agent' ? `Your account is registered as a ${existing.role}. UDC needs to review a role change before you can use agent access.`
        : existing.status === 'active' ? 'Your agent account is active. UDC verification is still needed before verified agent access.'
        : existing.status === 'verified' ? 'Your agent account is already approved. You can submit introductions for UDC review.'
        : 'Your agent registration is already pending UDC review.';
      const otpExempt = phone === OTP_EXEMPT_PHONE;
      return { reply, userId: otpExempt ? null : (existing.id as string | null), email: otpExempt ? null : (existing.email ?? null) as string | null };
    }
    // Registration must keep what the customer already gave in chat (owner
    // feedback, 10 Nov): name and email collected in the relay thread land
    // on the account instead of being lost and re-asked.
    const known = knownFactsForContact(phone);
    const [agent] = await tx.insert(usersTable).values({phone,fullName:fullName?.trim().slice(0,120) || known.name?.slice(0,120) || 'WhatsApp Agent',email:known.email ?? null,role:'agent',status:'pending',passwordHash:await hashPassword(randomUUID())}).returning({id:usersTable.id});
    await tx.insert(auditLogsTable).values({actorUserId:agent.id,action:'agent_registration_requested',entityType:'user',entityId:agent.id,metadata:{channel:'whatsapp',requiresAdminReview:true}});
    const admins = await tx.select({id:usersTable.id}).from(usersTable).where(and(eq(usersTable.role,'admin'),inArray(usersTable.status,['verified','active']))).limit(100);
    if(admins.length) await tx.insert(notificationsTable).values(admins.map(admin=>({userId:admin.id,type:'agent_registration_requested',title:'Agent registration needs review',body:'A WhatsApp agent registration is pending your review.',link:'/admin'})));
    queueAdminReviewAlert("agent registration", fullName);
    return { reply: 'Your agent registration is pending UDC review. Agent deal access starts after approval.', userId: agent.id as string | null, email: (known.email ?? null) as string | null };
  });
  // Owner rule (10 Nov): the email OTP is part of registration itself, asked
  // right after the email is given, before registration is treated as done.
  // New registrations and non-exempt existing accounts with an email trigger a
  // code here; Sandra's exempt account returns userId/email null above.
  if (result.userId && result.email && !isTesterPhone(phone)) {
    try {
      if (!(await emailAuth.status(result.userId)).emailVerified) {
        await emailAuth.requestVerification(result.userId);
        return 'I sent a 6-digit code to your email. Reply here with the code to confirm your email and finish your registration. It expires in 10 minutes.';
      }
    } catch { /* email sending off or rate limited: they can send Verify email later */ }
  }
  return result.reply;
}

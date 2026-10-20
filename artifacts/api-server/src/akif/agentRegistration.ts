import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { auditLogsTable, db, notificationsTable, usersTable } from '@workspace/db';
import { hashPassword } from '../auth/passwords';

export function isAgentRegistrationRequest(text: string) {
  return /^(?:(?:please\s+)?register me as (?:an?\s+)?(?:agent|broker)|i (?:am|want to (?:join|register) as) (?:an?\s+)?(?:agent|broker)|i['’]m (?:an?\s+)?(?:agent|broker))[.!\s]*$/i.test(text.trim());
}

export async function registerWhatsAppAgent(phone: string, fullName?: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'agent_registration:' + phone}))`);
    const [existing] = await tx.select({ id: usersTable.id, role: usersTable.role, status: usersTable.status }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (existing) {
      if (existing.role !== 'agent') return `Your account is registered as a ${existing.role}. UDC needs to review a role change before you can use agent access.`;
      return existing.status === 'verified' || existing.status === 'active'
        ? 'Your agent account is already approved. You can submit introductions for UDC review.'
        : 'Your agent registration is already pending UDC review.';
    }
    const [agent] = await tx.insert(usersTable).values({phone,fullName:fullName?.trim().slice(0,120) || 'WhatsApp Agent',role:'agent',status:'pending',passwordHash:await hashPassword(randomUUID())}).returning({id:usersTable.id});
    await tx.insert(auditLogsTable).values({actorUserId:agent.id,action:'agent_registration_requested',entityType:'user',entityId:agent.id,metadata:{channel:'whatsapp',requiresAdminReview:true}});
    const admins = await tx.select({id:usersTable.id}).from(usersTable).where(and(eq(usersTable.role,'admin'),inArray(usersTable.status,['verified','active']))).limit(100);
    if(admins.length) await tx.insert(notificationsTable).values(admins.map(admin=>({userId:admin.id,type:'agent_registration_requested',title:'Agent registration needs review',body:'A WhatsApp agent registration is pending your review.',link:'/admin'})));
    return 'Your agent registration is pending UDC review. Agent deal access starts after approval.';
  });
}

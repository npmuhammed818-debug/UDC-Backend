import { createHash, randomBytes } from 'node:crypto';
import { eq, lt, sql } from 'drizzle-orm';
import { db, auditLogsTable, usersTable, whatsappSigninChallengesTable as challenges } from '@workspace/db';
import { hashPassword } from './passwords';
import { createSession } from './sessions';

export type WhatsAppRole = 'buyer' | 'seller' | 'agent';
const eligible = (user: { role: string; status: string }) => ['buyer','seller','agent'].includes(user.role) && ['pending','under_review','active','verified'].includes(user.status);
export const signinHash = (purpose: 'code' | 'browser', value: string) => createHash('sha256').update(`UDC_WHATSAPP_SIGNIN_${purpose}\0${value}`).digest('hex');
export const parseSigninCommand = (text: string) => {
  const match = /^(CONFIRM LOGIN|LOGIN) ([A-F0-9]{16})$/i.exec(text.trim());
  return match ? { confirm: match[1].toUpperCase() === 'CONFIRM LOGIN', code: match[2].toUpperCase() } : null;
};

export async function requestWhatsAppSignin(role: WhatsAppRole, linkUserId?: string) {
  const code = randomBytes(8).toString('hex').toUpperCase();
  const browserToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await db.delete(challenges).where(lt(challenges.expiresAt, new Date(Date.now() - 86_400_000)));
  await db.insert(challenges).values({ codeHash: signinHash('code', code), browserTokenHash: signinHash('browser', browserToken), requestedRole: role, linkUserId, expiresAt });
  return { code, browserToken, expiresAt };
}

// Only called after the signed Meta webhook and the WhatsApp consent/block gates.
export async function handleWhatsAppSignin(phone: string, text: string, fullName?: string) {
  const command = parseSigninCommand(text);
  if (!command) return null;
  return db.transaction(async tx => {
    const codeHash = signinHash('code', command.code);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'whatsapp_signin:' + codeHash}))`);
    const [challenge] = await tx.select().from(challenges).where(eq(challenges.codeHash, codeHash)).limit(1);
    const unavailable = 'This sign-in request has expired or is unavailable. Start a new request on the UDC sign-in page.';
    if (!challenge || challenge.expiresAt <= new Date() || challenge.status === 'consumed') return unavailable;
    if (challenge.phone && challenge.phone !== phone) return unavailable;
    if (challenge.status === 'approved') return 'This request is already approved. Return to the browser where you started it.';
    if (!command.confirm) {
      await tx.update(challenges).set({phone, status:'confirmation'}).where(eq(challenges.id, challenge.id));
      return `Approve web sign-in only if YOU started this request on the UDC website. Never approve a code sent by someone else.\n${challenge.linkUserId ? 'This will link your WhatsApp number to the web account where you started the request.' : `Existing WhatsApp accounts keep their role and verification status. A new account will be a pending ${challenge.requestedRole}.`}\nIf you started it, reply CONFIRM LOGIN ${command.code}. Otherwise ignore this request.`;
    }
    if (challenge.status !== 'confirmation' || challenge.phone !== phone) return 'Send LOGIN followed by your code first, then read the confirmation warning.';
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'whatsapp_identity:' + phone}))`);
    const [existing] = await tx.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    let user = existing;
    if (challenge.linkUserId) {
      const [target] = await tx.select().from(usersTable).where(eq(usersTable.id, challenge.linkUserId)).limit(1).for('update');
      if (!target || !eligible(target) || (target.phone && target.phone !== phone)) return unavailable;
      if (existing && existing.id !== target.id) return 'This number already has a UDC profile. Use WhatsApp sign-in for that profile, or ask UDC to review your accounts. Accounts are never merged automatically.';
      await tx.update(usersTable).set({phone, updatedAt:new Date()}).where(eq(usersTable.id,target.id));
      user = target;
    } else {
      if (existing && (!eligible(existing) || existing.email)) return 'This account requires its existing email and password. Sign in there and use Link WhatsApp from your profile. Contact UDC if you need account recovery.';
      if (!user) {
        [user] = await tx.insert(usersTable).values({phone, fullName:fullName?.trim().slice(0,120) || 'WhatsApp user', role:challenge.requestedRole, status:'pending', passwordHash:await hashPassword(randomBytes(32).toString('base64url'))}).returning();
      }
    }
    await tx.update(challenges).set({approvedUserId:user.id,status:'approved'}).where(eq(challenges.id,challenge.id));
    await tx.insert(auditLogsTable).values({actorUserId:user.id,action:'whatsapp_web_signin_approved',entityType:'user',entityId:user.id,metadata:{channel:'whatsapp',linked:!!challenge.linkUserId}});
    return 'Approved. Return to the same UDC browser page to open your profile. Company verification still needs UDC review.';
  });
}

export async function pollWhatsAppSignin(browserToken: string, initiatingUserId?: string) {
  return db.transaction(async tx => {
    const browserTokenHash = signinHash('browser', browserToken);
    // Same challenge lock as the WhatsApp approval; the second browser poll re-reads consumed state.
    const [lookup] = await tx.select({codeHash:challenges.codeHash}).from(challenges).where(eq(challenges.browserTokenHash,browserTokenHash)).limit(1);
    if (!lookup) return {status:'expired' as const};
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'whatsapp_signin:' + lookup.codeHash}))`);
    const [challenge] = await tx.select().from(challenges).where(eq(challenges.browserTokenHash,browserTokenHash)).limit(1);
    if (!challenge || challenge.expiresAt <= new Date() || challenge.status === 'consumed') return {status:'expired' as const};
    if (challenge.linkUserId && challenge.linkUserId !== initiatingUserId) return {status:'expired' as const};
    if (challenge.status !== 'approved' || !challenge.approvedUserId) return {status:'pending' as const};
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id,challenge.approvedUserId)).limit(1);
    if (!user || !eligible(user) || user.phone !== challenge.phone) return {status:'expired' as const};
    // Linking requires the initiating web session again at the HTTP boundary.
    const session = await createSession(user.id,tx);
    await tx.update(challenges).set({status:'consumed',phone:null}).where(eq(challenges.id,challenge.id));
    await tx.insert(auditLogsTable).values({actorUserId:user.id,action:'whatsapp_web_signin_completed',entityType:'user',entityId:user.id,metadata:{channel:'web'}});
    return {status:'approved' as const, ...session};
  });
}

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  EMAIL_CODE_ATTEMPTS, EMAIL_CODE_TTL_MS, emailCodeHash, emailCodeMatches, newEmailCode,
} from "../auth/emailCodes";
import { deliverAuthEmail } from "../auth/emailTransport";
import { sendAuthEmail, type SendAuthEmail } from "../auth/emailDelivery";
import { emailAuth } from "../auth/emailAuth";
import { guidedChatPhoneHash } from "./phoneFingerprint";

// All entry points must be called only after Meta HMAC and WhatsApp consent validation.
// An email alone is never proof of identity. Moving phones keeps the existing user ID.
const emailSchema = z.email().max(254);
const generic = "If this verified UDC email is eligible, a 6-digit sign-in code will arrive by email. Reply Phone code followed by the code. It expires in 10 minutes.";
const denied = "That code is invalid, expired or unavailable. You can request a new code, or contact UDC for account review.";
const eligible = (status: string, role: string) =>
  !["suspended", "rejected"].includes(status) && ["buyer", "seller", "agent"].includes(role);
type UserRow = {
  id: string; email: string | null; verified_email: string | null; email_verified_at: Date | null;
  phone: string | null; status: string; role: string;
};
type Challenge = {
  id: string; user_id: string; email: string; old_phone: string | null; new_phone: string;
  code_hash: string; attempts: number; expires_at: Date; consumed_at: Date | null;
};
export const phoneRecoveryCommand = (body: string) => {
  const text = body.trim();
  const request = /^(?:sign in|recover account|change number)\s+([^\s]+@[^\s]+)$/i.exec(text);
  const confirm = /^phone code(?:\s+(.*))?$/i.exec(text);
  return request ? {kind: "request" as const, email: request[1]} :
    confirm ? {kind: "confirm" as const, code: confirm[1] ?? ""} : null;
};

export function createPhoneRecoveryService(options: {
  database?: typeof db;
  send?: SendAuthEmail;
  now?: () => Date;
  secret?: () => string;
  budget?: (key: string, action: "send" | "check") => Promise<void>;
} = {}) {
  const database = options.database ?? db;
  const send = options.send ?? sendAuthEmail;
  const now = options.now ?? (() => new Date());
  const secret = options.secret ?? (() => process.env.SESSION_SECRET ?? "");
  const budget = options.budget ?? emailAuth.ipBudget;

  async function request(phone: string, rawEmail: string) {
    await budget("phone-recovery:" + phone, "send");
    const parsed = emailSchema.safeParse(rawEmail.trim().toLowerCase());
    if (!parsed.success) return generic;
    const email = parsed.data;
    const issued = await database.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"phone_recovery:" + phone}))`);
      const {rows: bound} = await tx.execute(sql`select id from public.users where phone=${phone} limit 1`);
      if (bound.length) return null; // Do not silently merge any two accounts.
      const {rows} = await tx.execute(
        sql`select id,email,verified_email,email_verified_at,phone,status,role
            from public.users where lower(email)=${email} order by id limit 2 for update`
      );
      if (rows.length !== 1) return null;
      const user = rows[0] as UserRow;
      if (!user.email || !user.email_verified_at ||
        user.verified_email !== user.email.trim().toLowerCase() ||
        !eligible(user.status, user.role)) return null;
      const {rows: quotas} = await tx.execute(
        sql`select count(*)::integer AS n, max(created_at) AS latest
            from public.whatsapp_phone_link_challenges
            where user_id=${user.id} and created_at>${new Date(now().getTime()-60*60_000)}`
      );
      const recent = quotas[0] as {n: number; latest: Date | null} | undefined;
      if ((recent?.n ?? 0) >= 5 ||
        (recent?.latest && now().getTime()-new Date(recent.latest).getTime()<60_000)) return null;
      const id = randomUUID(), code = newEmailCode();
      const expiresAt = new Date(now().getTime()+EMAIL_CODE_TTL_MS);
      const codeHash = emailCodeHash(secret(), "link_phone", id, user.id, email+"|"+phone, code);
      await tx.execute(
        sql`update public.whatsapp_phone_link_challenges set consumed_at=${now()}
            where new_phone=${phone} and consumed_at is null`
      );
      await tx.execute(
        sql`insert into public.whatsapp_phone_link_challenges
            (id,user_id,email,old_phone,new_phone,code_hash,expires_at)
            values (${id},${user.id},${email},${user.phone},${phone},${codeHash},${expiresAt})`
      );
      return {id,to: email,code,expiresAt};
    });
    if (issued) {
      try {
        await deliverAuthEmail(send, {to: issued.to, code: issued.code,
          purpose: "link_phone", expiresAt: issued.expiresAt});
      } catch {
        // Never leave a valid challenge if delivery is missing or times out.
        await database.execute(sql`update public.whatsapp_phone_link_challenges
          set consumed_at=${now()} where id=${issued.id}`);
      }
    }
    // Same response for absent, blocked, unverified, rate-limited or delivered identities.
    return generic;
  }

  async function confirm(phone: string, code: string) {
    await budget("phone-recovery:" + phone, "check");
    if (!/^\d{6}$/.test(code)) return denied;
    const changed = await database.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"phone_recovery:" + phone}))`);
      const {rows} = await tx.execute(
        sql`select id,user_id,email,old_phone,new_phone,code_hash,attempts,expires_at,consumed_at
            from public.whatsapp_phone_link_challenges where new_phone=${phone}
            order by created_at desc,id desc limit 1 for update`
      );
      const c = rows[0] as Challenge | undefined;
      if (!c || c.consumed_at || c.attempts >= EMAIL_CODE_ATTEMPTS ||
        new Date(c.expires_at).getTime() <= now().getTime()) return false;
      const {rows: accounts} = await tx.execute(
        sql`select id,email,verified_email,email_verified_at,phone,status,role
            from public.users where id=${c.user_id} for update`
      );
      const user = accounts[0] as UserRow | undefined;
      const valid = Boolean(user && user.email &&
        user.email.trim().toLowerCase()===c.email &&
        user.verified_email===c.email && user.email_verified_at &&
        user.phone===c.old_phone && eligible(user.status,user.role));
      const matches = valid && emailCodeMatches(c.code_hash,
        emailCodeHash(secret(),"link_phone",c.id,c.user_id,c.email+"|"+phone,code));
      await tx.execute(
        sql`update public.whatsapp_phone_link_challenges
            set attempts=attempts+1,consumed_at=${matches||c.attempts+1>=EMAIL_CODE_ATTEMPTS?now():null}
            where id=${c.id}`
      );
      if (!matches || !user) return false;
      const {rows: collisions} = await tx.execute(
        sql`select id from public.users where phone=${phone} limit 1 for update`
      );
      if (collisions.length) return false;
      // Move only the phone binding, never create/merge a different user ID.
      await tx.execute(
        sql`update public.users set phone=${phone},updated_at=${now()}
            where id=${user.id} and phone is not distinct from ${c.old_phone}`
      );
      // Revoke stale sessions and pending WhatsApp drafts on the old number.
      await tx.execute(sql`update public.auth_sessions set revoked_at=${now()}
        where user_id=${user.id} and revoked_at is null`);
      if (c.old_phone) {
        await tx.execute(sql`delete from public.whatsapp_intake_drafts where phone=${c.old_phone}`);
        await tx.execute(sql`delete from public.whatsapp_chat_sessions
          where phone_hash=${guidedChatPhoneHash(c.old_phone)}`);
      }
      await tx.execute(sql`delete from public.whatsapp_chat_sessions
        where phone_hash=${guidedChatPhoneHash(phone)}`);
      await tx.execute(sql`delete from public.whatsapp_intake_drafts where phone=${phone}`);
      await tx.execute(sql`delete from public.whatsapp_user_contexts where user_id=${user.id}`);
      await tx.execute(sql`update public.whatsapp_phone_link_challenges
        set consumed_at=coalesce(consumed_at,${now()}) where user_id=${user.id}`);
      await tx.execute(sql`insert into public.audit_logs
        (actor_user_id,action,entity_type,entity_id,metadata)
        values (${user.id},'whatsapp_number_recovered','user',${user.id},
          '{"emailVerified":true,"oldNumberUnlinked":true}'::jsonb)`);
      return true;
    });
    return changed
      ? "Your original UDC account is now linked to this WhatsApp number. Your deals and verification history are preserved. The old number can no longer access it. Open Menu to continue."
      : denied;
  }

  async function handle(phone: string, text: string) {
    const action = phoneRecoveryCommand(text);
    if (!action) return null;
    if (!/^\d{7,20}$/.test(phone)) return denied;
    try {
      return action.kind === "request"
        ? await request(phone,action.email)
        : await confirm(phone,action.code);
    } catch {
      // Never leak SQL, email identity, or provider errors into WhatsApp.
      return "Account recovery is unavailable right now. Please try again later.";
    }
  }
  return {handle,request,confirm};
}

export const phoneRecovery = createPhoneRecoveryService();
export const handlePhoneRecovery = (phone: string,text: string) => phoneRecovery.handle(phone,text);

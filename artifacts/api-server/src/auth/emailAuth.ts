import { z } from "zod/v4";
import { createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { deliverAuthEmail } from "./emailTransport";
import { hashPassword } from "./passwords";
import {
  emailCodeHash,
  emailCodeMatches,
  EMAIL_CODE_ATTEMPTS,
  EMAIL_CODE_TTL_MS,
  newEmailCode,
  type EmailPurpose,
} from "./emailCodes";
import {
  sendAuthEmail,
  type SendAuthEmail,
  type AuthEmail,
} from "./emailDelivery";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Account = {
  id: string;
  email: string | null;
  verified_email: string | null;
  email_verified_at: Date | null;
  password_recovery_enabled: boolean;
  status: string;
};
type Challenge = {
  id: string;
  email: string;
  code_hash: string;
  attempts: number;
  expires_at: Date | string;
  consumed_at: Date | null;
};
export class EmailAuthError extends Error {
  readonly kind: "rate_limited" | "invalid_code" | "unavailable";
  constructor(kind: "rate_limited" | "invalid_code" | "unavailable") {
    super(kind);
    this.kind = kind;
  }
}
const eligible = (u: Account) => !["suspended", "rejected"].includes(u.status);
const epoch = (value: Date | string) => new Date(value).getTime();
const ownsEmail = (u: Account) =>
  !!u.email_verified_at &&
  !!u.email &&
  u.verified_email === u.email.trim().toLowerCase();

export function createEmailAuthService(
  options: {
    send?: SendAuthEmail;
    now?: () => Date;
    database?: typeof db;
    secret?: () => string;
  } = {},
) {
  const database = options.database ?? db;
  const send = options.send ?? sendAuthEmail;
  const now = options.now ?? (() => new Date());
  const secret = options.secret ?? (() => process.env.SESSION_SECRET ?? "");
  const digest = (value: string) => {
    const key = secret();
    if (key.length < 32) throw new EmailAuthError("unavailable");
    return createHmac("sha256", key)
      .update("udc-email-limit-v1\0" + value)
      .digest("hex");
  };

  // Durable limits survive process restarts and are shared by all API instances.
  // The advisory lock serializes absent-row creation as well as existing counters.
  async function charge(
    tx: Executor,
    key: string,
    limit: number,
    windowMs: number,
    spacingMs = 0,
  ) {
    const hash = digest(key),
      date = now();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${hash}))`);
    const { rows } = await tx.execute(
      sql`select count, window_start, last_attempt_at from email_auth_limits where key=${hash}`,
    );
    const row = rows[0] as
      | {
          count: number;
          window_start: Date | string;
          last_attempt_at: Date | string;
        }
      | undefined;
    if (
      row &&
      (!Number.isFinite(epoch(row.window_start)) ||
        !Number.isFinite(epoch(row.last_attempt_at)))
    ) {
      throw new EmailAuthError("unavailable");
    }
    const fresh = !row || date.getTime() - epoch(row.window_start) >= windowMs;
    if (
      row &&
      ((!fresh && row.count >= limit) ||
        date.getTime() - epoch(row.last_attempt_at) < spacingMs)
    )
      return false;
    await tx.execute(sql`insert into email_auth_limits (key,count,window_start,last_attempt_at)
      values (${hash},${fresh ? 1 : row!.count + 1},${fresh ? date : row!.window_start},${date})
      on conflict (key) do update set count=excluded.count,window_start=excluded.window_start,last_attempt_at=excluded.last_attempt_at`);
    return true;
  }
  async function ipBudget(ip: string, operation: "send" | "check") {
    // Commit even when the later operation is rejected; malformed requests also use this budget.
    const allowed = await database.transaction(async (tx) => {
      await tx.execute(
        sql`delete from email_auth_limits where window_start < ${new Date(now().getTime() - 2 * 86_400_000)}`,
      );
      await tx.execute(
        sql`delete from email_auth_challenges where expires_at < ${new Date(now().getTime() - 86_400_000)}`,
      );
      return charge(
        tx,
        `ip:${operation}:${ip}`,
        operation === "send" ? 10 : 20,
        15 * 60_000,
      );
    });
    if (!allowed) throw new EmailAuthError("rate_limited");
  }
  async function account(tx: Executor, userId: string) {
    const { rows } = await tx.execute(
      sql`select id,email,verified_email,email_verified_at,password_recovery_enabled,status from users where id=${userId} for update`,
    );
    return rows[0] as Account | undefined;
  }

  async function issue(
    purpose: EmailPurpose,
    userId: string | undefined,
    email: string | undefined,
  ) {
    const response = {
      challengeId: randomUUID(),
      expiresInSeconds: EMAIL_CODE_TTL_MS / 1000,
    };
    const issued = await database.transaction(async (tx) => {
      let user: Account | undefined;
      if (userId) user = await account(tx, userId);
      else {
        const { rows } = await tx.execute(
          sql`select id,email,verified_email,email_verified_at,password_recovery_enabled,status from users where lower(email)=${email!} for update`,
        );
        user = rows[0] as Account | undefined;
      }
      if (!user || !user.email || !eligible(user)) return null;
      if (
        purpose === "reset_password" &&
        (!user.password_recovery_enabled || !ownsEmail(user))
      )
        return null;
      if (purpose === "verify_email" && ownsEmail(user)) return null;
      if (
        !(await charge(
          tx,
          `account:${purpose}:${user.id}`,
          5,
          60 * 60_000,
          60_000,
        ))
      ) {
        if (purpose === "verify_email")
          throw new EmailAuthError("rate_limited");
        return null;
      }
      const parsedEmail = z
        .string()
        .trim()
        .max(254)
        .email()
        .safeParse(user.email);
      if (!parsedEmail.success) return null;
      const recipient = parsedEmail.data.toLowerCase();
      const code = newEmailCode();
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + EMAIL_CODE_TTL_MS);
      const hash = emailCodeHash(
        secret(),
        purpose,
        response.challengeId,
        user.id,
        recipient,
        code,
      );
      await tx.execute(
        sql`update email_auth_challenges set consumed_at=${now()} where user_id=${user.id} and purpose=${purpose} and consumed_at is null`,
      );
      await tx.execute(sql`insert into email_auth_challenges (id,user_id,email,purpose,code_hash,expires_at,created_at)
        values (${response.challengeId},${user.id},${recipient},${purpose},${hash},${expiresAt},${issuedAt})`);
      return { to: recipient, code, purpose, expiresAt } satisfies AuthEmail;
    });
    if (issued) {
      try {
        await deliverAuthEmail(send, issued);
      } catch {
        await database.execute(
          sql`update email_auth_challenges set consumed_at=${now()} where id=${response.challengeId}`,
        );
        if (purpose === "verify_email") throw new EmailAuthError("unavailable");
        // Reset request responses never distinguish unknown accounts or delivery failures.
      }
    }
    return response;
  }

  async function consume(
    tx: Executor,
    user: Account | undefined,
    purpose: EmailPurpose,
    id: string,
    code: string,
  ) {
    if (!user || !user.email || !eligible(user)) return false;
    if (
      purpose === "reset_password" &&
      (!user.password_recovery_enabled || !ownsEmail(user))
    )
      return false;
    const { rows } = await tx.execute(
      sql`select id,email,code_hash,attempts,expires_at,consumed_at from email_auth_challenges where id=${id} and user_id=${user.id} and purpose=${purpose} for update`,
    );
    const c = rows[0] as Challenge | undefined;
    if (
      !c ||
      c.consumed_at ||
      !Number.isFinite(epoch(c.expires_at)) ||
      epoch(c.expires_at) <= now().getTime() ||
      c.attempts >= EMAIL_CODE_ATTEMPTS ||
      c.email !== user.email.trim().toLowerCase()
    )
      return false;
    const valid = emailCodeMatches(
      c.code_hash,
      emailCodeHash(secret(), purpose, id, user.id, c.email, code),
    );
    await tx.execute(
      sql`update email_auth_challenges set attempts=attempts+1,consumed_at=${valid || c.attempts + 1 >= EMAIL_CODE_ATTEMPTS ? now() : null} where id=${id}`,
    );
    return valid;
  }

  return {
    ipBudget,
    async status(userId: string) {
      const { rows } = await database.execute(
        sql`select email,verified_email,email_verified_at,password_recovery_enabled from users where id=${userId}`,
      );
      const user = rows[0] as Account | undefined;
      return {
        emailVerified: !!user && ownsEmail(user),
        passwordRecoveryEnabled: !!user?.password_recovery_enabled,
      };
    },
    // Routes charge IP limits before validation, including malformed/anonymous requests.
    requestVerification: (userId: string) =>
      issue("verify_email", userId, undefined),
    async requestReset(email: string) {
      const started = performance.now();
      try {
        return await issue("reset_password", undefined, email);
      } finally {
        // Match unknown/cooldown/eligible response timing under normal DB latency,
        // including the bounded 2-second provider attempt. No account-specific response.
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, 2_500 - (performance.now() - started)),
          ),
        );
      }
    },
    async verify(userId: string, id: string, code: string) {
      const success = await database.transaction(async (tx) => {
        const user = await account(tx, userId);
        if (!(await consume(tx, user, "verify_email", id, code))) return false;
        await tx.execute(
          sql`update users set verified_email=lower(trim(email)),email_verified_at=${now()} where id=${userId}`,
        );
        await tx.execute(
          sql`insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata) values (${userId},'email_ownership_verified','user',${userId},'{}'::jsonb)`,
        );
        return true;
      });
      if (!success) throw new EmailAuthError("invalid_code");
    },
    async reset(email: string, id: string, code: string, password: string) {
      const success = await database.transaction(async (tx) => {
        const { rows } = await tx.execute(
          sql`select id,email,verified_email,email_verified_at,password_recovery_enabled,status from users where lower(email)=${email} for update`,
        );
        const user = rows[0] as Account | undefined;
        if (!(await consume(tx, user, "reset_password", id, code)))
          return false;
        const passwordHash = await hashPassword(password);
        await tx.execute(
          sql`update users set password_hash=${passwordHash},updated_at=${now()} where id=${user!.id}`,
        );
        await tx.execute(
          sql`update auth_sessions set revoked_at=${now()} where user_id=${user!.id} and revoked_at is null`,
        );
        await tx.execute(
          sql`update email_auth_challenges set consumed_at=coalesce(consumed_at,${now()}) where user_id=${user!.id}`,
        );
        await tx.execute(
          sql`insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata) values (${user!.id},'password_recovered','user',${user!.id},'{}'::jsonb)`,
        );
        return true;
      });
      if (!success) throw new EmailAuthError("invalid_code");
    },
  };
}
export const emailAuth = createEmailAuthService();

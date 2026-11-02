import { verifyAgentInvitation, agentReferralCode } from "../referrals/invitation";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  auditLogsTable,
  companiesTable,
  referralsTable,
  notificationPreferencesTable,
  usersTable,
} from "@workspace/db";
import { emailAuth } from "../auth/emailAuth";
import { authRateLimitKey } from "../auth/rateLimit";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { createSession, revokeSession, SESSION_COOKIE } from "../auth/sessions";
import { requireAuth } from "../auth/middleware";
import { getSafeUserProfile } from "../auth/userProfile";

import { POLICY_VERSION } from "../privacy/policies";

const router: IRouter = Router();

import { registrationSchema } from "../privacy/registration";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

// One cached scrypt hash of a random value; unknown-email logins verify
// against it so their timing matches a real wrong-password attempt.
let cachedDummyHash: string | undefined;
async function dummyPasswordHash() {
  if (!cachedDummyHash) cachedDummyHash = await hashPassword(randomUUID());
  return cachedDummyHash;
}

function validationResponse(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return true;
  }
  return false;
}

router.post("/auth/register", async (req, res) => {
  const rateKey = authRateLimitKey(req);
  if (!(await emailAuth.webAuthBudgetAllowed(rateKey, "register"))) {
    res.status(429).json({ error: "too_many_auth_attempts" });
    return;
  }

  try {
    const input = registrationSchema.parse(req.body);
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${input.email}`)
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "email_already_registered" });
      return;
    }

    let referringAgentId: string | null = null;
    if (input.referral_token) {
      const id = verifyAgentInvitation(input.referral_token, process.env.WHATSAPP_APP_SECRET ?? "");
      const [agent] = id ? await db.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.id, id), eq(usersTable.role, "agent"), eq(usersTable.status, "verified"))).limit(1) : [];
      if (!agent || input.role === "agent") { res.status(400).json({ error: "invalid_referral_invitation" }); return; }
      referringAgentId = agent.id;
    }
    const passwordHash = await hashPassword(input.password);
    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(usersTable)
        .values({
          fullName: input.full_name,
          email: input.email,
          passwordHash,
          passwordRecoveryEnabled: true,
          role: input.role,
          status: "pending",
        })
        .returning({ id: usersTable.id });
      if (input.role !== "agent" && input.company_name) {
        await tx.insert(companiesTable).values({
          ownerUserId: created.id,
          companyName: input.company_name,
          verificationStatus: "pending",
        });
      }
      await tx
        .insert(auditLogsTable)
        .values({
          actorUserId: created.id,
          action: "registration_consent_recorded",
          entityType: "user",
          entityId: created.id,
          metadata: {
            policyVersion: POLICY_VERSION,
            termsAccepted: true,
            adultBusinessUser: true,
            source: "web_registration",
          },
        });
      await tx
        .insert(notificationPreferencesTable)
        .values({
          userId: created.id,
          optionalInApp: false,
          optionalWhatsApp: false,
          reminders: false,
          announcements: false,
        });
      if (referringAgentId) {
        const [referral] = await tx.insert(referralsTable).values({ agentUserId: referringAgentId, referredUserId: created.id, referralCode: agentReferralCode(referringAgentId), status: "pending" }).returning({ id: referralsTable.id });
        await tx.insert(auditLogsTable).values({ actorUserId: created.id, action: "referral_invitation_accepted", entityType: "referral", entityId: referral.id, metadata: { agentUserId: referringAgentId, referredUserId: created.id, introductionAcceptedByRegistrant: true, requiresAdminReview: true } });
      }
      return created;
    });

    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(res, token, expiresAt);

    res.status(201).json({
      user: await getSafeUserProfile(user.id),
    });
  } catch (error) {
    if (validationResponse(res, error)) return;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "email_already_registered" });
      return;
    }
    res.status(500).json({ error: "registration_failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  const rateKey = authRateLimitKey(req);
  if (!(await emailAuth.webAuthBudgetAllowed(rateKey, "login"))) {
    res.status(429).json({ error: "too_many_auth_attempts" });
    return;
  }

  try {
    const input = loginSchema.parse(req.body);
    // Serialize password proof/session creation with password reset. Otherwise a
    // login verified against an old hash could create a session after revocation.
    const result = await db.transaction(async tx => {
      const [user] = await tx.select().from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${input.email}`).limit(1).for("update");
      // Unknown email: run the same password work against a dummy hash so the
      // response timing does not reveal which emails have accounts. No budget
      // row is written for emails that do not exist.
      if (!user) {
        await verifyPassword(input.password, await dummyPasswordHash());
        return { kind: "invalid" as const };
      }
      // Per-account budget: charged atomically inside the account row lock
      // BEFORE verification, so parallel guesses cannot slip past the cap.
      if (!(await emailAuth.chargePasswordLoginAttempt(tx, input.email))) return { kind: "limited" as const };
      if (!(await verifyPassword(input.password, user.passwordHash))) return { kind: "invalid" as const };
      if (["suspended", "rejected"].includes(user.status)) return { kind: "blocked" as const };
      // Successful password proof safely identifies legacy password accounts;
      // random WhatsApp-only hashes are never inferred to be recovery credentials.
      await tx.update(usersTable).set({ passwordRecoveryEnabled: true }).where(eq(usersTable.id,user.id));
      await emailAuth.clearPasswordLoginBudget(input.email, tx);
      return { kind: "authenticated" as const, userId: user.id, ...await createSession(user.id,tx) };
    });
    if (result.kind === "limited") {
      res.status(429).json({ error: "too_many_auth_attempts" });
      return;
    }
    if (result.kind === "invalid") {
      res.status(401).json({ error: "invalid_email_or_password" });
      return;
    }
    if (result.kind === "blocked") {
      res.status(403).json({ error: "account_suspended" });
      return;
    }
    setSessionCookie(res, result.token, result.expiresAt);
    res.json({ user: await getSafeUserProfile(result.userId) });
  } catch (error) {
    if (validationResponse(res, error)) return;
    res.status(500).json({ error: "login_failed" });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    if (req.authToken) {
      await revokeSession(req.authToken);
    }
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "logout_failed" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const profile = await getSafeUserProfile(req.authUser!.id);
  if (!profile) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  res.json({ user: profile });
});

export default router;

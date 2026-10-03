import { Router, type IRouter, type Response } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  auditLogsTable,
  notificationPreferencesTable,
  usersTable,
} from "@workspace/db";
import {
  authRateLimitKey,
  clearAuthFailures,
  isAuthRateLimited,
  recordAuthFailure,
} from "../auth/rateLimit";
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
  if (isAuthRateLimited(rateKey)) {
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

    const passwordHash = await hashPassword(input.password);
    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(usersTable)
        .values({
          fullName: input.full_name,
          email: input.email,
          phone: input.phone,
          passwordHash,
          role: input.role,
          status: input.role === "agent" ? "active" : "pending",
        })
        .returning({ id: usersTable.id });
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
  if (isAuthRateLimited(rateKey)) {
    res.status(429).json({ error: "too_many_auth_attempts" });
    return;
  }

  try {
    const input = loginSchema.parse(req.body);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${input.email}`)
      .limit(1);

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      recordAuthFailure(rateKey);
      res.status(401).json({ error: "invalid_email_or_password" });
      return;
    }

    if (user.status === "suspended") {
      res.status(403).json({ error: "account_suspended" });
      return;
    }

    clearAuthFailures(rateKey);
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(res, token, expiresAt);
    res.json({ user: await getSafeUserProfile(user.id) });
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

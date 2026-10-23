import { Router, type IRouter, type Response } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";
import { verifyPassword } from "../auth/passwords";
import { getSafeUserProfile } from "../auth/userProfile";

const router: IRouter = Router();

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

const profileSchema = z
  .object({
    full_name: z.string().trim().min(2).max(200).optional(),
    email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
    phone: z.never().optional(),
    current_password: z.string().max(1024).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required.",
  });

router.put("/profile", requireAuth, async (req, res) => {
  try {
    const input = profileSchema.parse(req.body);
    if (input.email) {
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            sql`lower(${usersTable.email}) = ${input.email}`,
            ne(usersTable.id, req.authUser!.id),
          ),
        )
        .limit(1);
      if (existing) {
        res.status(409).json({ error: "email_already_registered" });
        return;
      }
    }

    const updated = await db.transaction(async tx => {
      const [current] = await tx.select().from(usersTable).where(eq(usersTable.id,req.authUser!.id)).limit(1).for("update");
      if (!current) return false;
      const changingEmail = input.email !== undefined && input.email !== current.email?.toLowerCase();
      if (changingEmail &&
        (!input.current_password || !await verifyPassword(input.current_password,current.passwordHash))) return false;
      await tx.update(usersTable).set({
        ...(input.full_name === undefined ? {} : { fullName: input.full_name }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(changingEmail ? { verifiedEmail:null, emailVerifiedAt:null } : {}),
        updatedAt: new Date(),
      }).where(eq(usersTable.id,req.authUser!.id));
      if (changingEmail) await tx.execute(sql`update email_auth_challenges set consumed_at=coalesce(consumed_at,now()) where user_id=${req.authUser!.id}`);
      return true;
    });
    if (!updated) { res.status(403).json({error:"current_password_required"}); return; }

    res.json({ user: await getSafeUserProfile(req.authUser!.id) });
  } catch (error) {
    if (validationResponse(res, error)) return;
    res.status(500).json({ error: "profile_update_failed" });
  }
});

export default router;

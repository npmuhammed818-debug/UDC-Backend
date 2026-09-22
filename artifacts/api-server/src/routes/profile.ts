import { Router, type IRouter, type Response } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";
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
    phone: z.string().trim().min(3).max(50).nullable().optional(),
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

    await db
      .update(usersTable)
      .set({
        ...(input.full_name === undefined ? {} : { fullName: input.full_name }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, req.authUser!.id));

    res.json({ user: await getSafeUserProfile(req.authUser!.id) });
  } catch (error) {
    if (validationResponse(res, error)) return;
    res.status(500).json({ error: "profile_update_failed" });
  }
});

export default router;
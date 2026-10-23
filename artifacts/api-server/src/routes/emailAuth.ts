import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { authRateLimitKey } from "../auth/rateLimit";
import { emailAuth, EmailAuthError } from "../auth/emailAuth";
import { passwordSchema } from "../privacy/registration";
import { requireAuth } from "../auth/middleware";

const router: IRouter = Router();
const email = z
  .string()
  .trim()
  .max(254)
  .email()
  .transform((v) => v.toLowerCase());
const proof = z
  .object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
  .strict();
const reset = proof.extend({ email, password: passwordSchema });
const requested = {
  message:
    "If this request is eligible, a code will arrive by email. Codes expire in 10 minutes. Wait at least 60 seconds before requesting another.",
};

function failure(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "validation_error" });
    return;
  }
  if (error instanceof EmailAuthError && error.kind === "rate_limited") {
    res
      .set("Retry-After", "900")
      .status(429)
      .json({ error: "too_many_auth_attempts" });
    return;
  }
  if (error instanceof EmailAuthError && error.kind === "invalid_code") {
    res.status(400).json({ error: "invalid_or_expired_code" });
    return;
  }
  res.status(503).json({ error: "email_auth_unavailable" });
}
router.use("/auth/email", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use("/auth/password", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.get("/auth/email/status", requireAuth, async (req, res) => {
  try {
    res.json(await emailAuth.status(req.authUser!.id));
  } catch (error) {
    failure(res, error);
  }
});
for (const purpose of ["email/verification", "password/recovery"] as const) {
  const verification = purpose === "email/verification";
  router.post(
    `/auth/${purpose}/request`,
    async (req: Request, res: Response) => {
      try {
        await emailAuth.ipBudget(authRateLimitKey(req), "send");
        if (verification) {
          if (!req.authUser) {
            res.status(401).json({ error: "authentication_required" });
            return;
          }
          if (["suspended", "rejected"].includes(req.authUser.status)) {
            res.status(403).json({ error: "account_unavailable" });
            return;
          }
          z.object({}).strict().parse(req.body);
        }
        const input = verification
          ? undefined
          : z.object({ email }).strict().parse(req.body);
        const result = verification
          ? await emailAuth.requestVerification(req.authUser!.id)
          : await emailAuth.requestReset(input!.email);
        res.status(202).json({ ...requested, ...result });
      } catch (error) {
        failure(res, error);
      }
    },
  );
}
router.post("/auth/email/verification/confirm", async (req, res) => {
  try {
    await emailAuth.ipBudget(authRateLimitKey(req), "check");
    if (!req.authUser) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    const input = proof.parse(req.body);
    await emailAuth.verify(req.authUser.id, input.challengeId, input.code);
    res.json({ emailVerified: true });
  } catch (error) {
    failure(res, error);
  }
});
router.post("/auth/password/recovery/confirm", async (req, res) => {
  try {
    await emailAuth.ipBudget(authRateLimitKey(req), "check");
    const input = reset.parse(req.body);
    await emailAuth.reset(
      input.email,
      input.challengeId,
      input.code,
      input.password,
    );
    // No auto-login: all old sessions are revoked and the new password must be used.
    res.json({ success: true });
  } catch (error) {
    failure(res, error);
  }
});
export default router;

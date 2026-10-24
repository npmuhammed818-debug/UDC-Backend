import type { NextFunction, Request, Response } from "express";

/**
 * Human verification is required before a buyer or seller can submit
 * marketplace trade terms. This middleware must run AFTER requireRole,
 * so missing authentication and role mismatches retain their own
 * 401/403 responses and no database write or validation occurs first.
 *
 * Email ownership confirmation alone never marks a UDC account verified.
 */
export function requireVerifiedAccount(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.authUser?.status !== "verified") {
    res.status(403).json({ error: "verification_required" });
    return;
  }
  next();
}

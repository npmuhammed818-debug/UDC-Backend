import type { NextFunction, Request, Response } from "express";

/**
 * Agents are allowed their assigned redacted /agent/deals and
 * /deals/:dealId/tracking milestone views only. Generic deal, document,
 * financial, meeting, message, timeline and trade-draft routes carry
 * sensitive commercial data and must not be exposed to agents.
 *
 * Compose AFTER requireAuth, before any query or side effect.
 */
export function requireNonAgentDealAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.authUser) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  if (req.authUser.role === "agent") {
    res.status(403).json({ error: "agent_milestones_only" });
    return;
  }
  next();
}

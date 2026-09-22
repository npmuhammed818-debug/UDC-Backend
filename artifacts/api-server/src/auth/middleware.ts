import type { NextFunction, Request, Response } from "express";
import { getAuthenticatedUser } from "./sessions";
import type { AuthenticatedUser } from "./types";

function getToken(req: Request) {
  const authorization = req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return req.cookies?.udc_session as string | undefined;
}

export async function loadAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = getToken(req);
    if (token) {
      const user = await getAuthenticatedUser(token);
      if (user) {
        req.authUser = user;
        req.authToken = token;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.authUser) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  if (req.authUser.status === "suspended") {
    res.status(403).json({ error: "account_suspended" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    if (req.authUser.status === "suspended") {
      res.status(403).json({ error: "account_suspended" });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
    next();
  };
}

export type AuthenticatedRequest = Request & {
  authUser: AuthenticatedUser;
  authToken?: string;
};
import type { Request } from "express";

type AttemptWindow = {
  startedAt: number;
  count: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const attempts = new Map<string, AttemptWindow>();

export function authRateLimitKey(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function isAuthRateLimited(key: string) {
  const current = attempts.get(key);
  if (!current) return false;
  if (Date.now() - current.startedAt >= WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

export function recordAuthFailure(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    attempts.set(key, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
}

export function clearAuthFailures(key: string) {
  attempts.delete(key);
}
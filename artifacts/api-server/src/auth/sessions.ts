import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { authSessionsTable, usersTable } from "@workspace/db";
import type { AuthenticatedUser } from "./types";

export const SESSION_COOKIE = "udc_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set for authentication sessions.");
  }
  return secret;
}

function hashSessionToken(token: string) {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(authSessionsTable).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function getAuthenticatedUser(token: string) {
  const now = new Date();
  const [result] = await db
    .select({
      sessionId: authSessionsTable.id,
      userId: usersTable.id,
      email: usersTable.email,
      phone: usersTable.phone,
      fullName: usersTable.fullName,
      role: usersTable.role,
      status: usersTable.status,
    })
    .from(authSessionsTable)
    .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(authSessionsTable.tokenHash, hashSessionToken(token)),
        isNull(authSessionsTable.revokedAt),
        gt(authSessionsTable.expiresAt, now),
      ),
    );

  if (!result) return undefined;

  await db
    .update(authSessionsTable)
    .set({ lastUsedAt: now })
    .where(eq(authSessionsTable.id, result.sessionId));

  const { sessionId: _sessionId, userId: id, ...user } = result;
  return { id, ...user } satisfies AuthenticatedUser;
}

export async function revokeSession(token: string) {
  await db
    .update(authSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(authSessionsTable.tokenHash, hashSessionToken(token)));
}
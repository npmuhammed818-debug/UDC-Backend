import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { auditLogsTable, db } from "@workspace/db";
import { requireAuth, requireRole } from "../auth/middleware";
import {
  deletionRequestSchema,
  requestReviewSchema,
} from "../privacy/requests";

const router: IRouter = Router();
const requestType = eq(auditLogsTable.entityType, "privacy_request");
const owner = (userId: string) =>
  sql`${auditLogsTable.metadata}->>'userId' = ${userId}`;

// Reuse the private audit store: every transition is a new immutable event.
router.get("/privacy/requests", requireAuth, async (req, res) => {
  try {
    const requests = await db
      .selectDistinctOn([auditLogsTable.entityId])
      .from(auditLogsTable)
      .where(and(requestType, owner(req.authUser!.id)))
      .orderBy(
        asc(auditLogsTable.entityId),
        desc(auditLogsTable.createdAt),
        desc(auditLogsTable.id),
      );
    res.json({ requests });
  } catch {
    res.status(500).json({ error: "privacy_requests_fetch_failed" });
  }
});

router.post("/privacy/requests", requireAuth, async (req, res) => {
  if (!deletionRequestSchema.safeParse(req.body).success) {
    res.status(400).json({ error: "confirm_deletion_review_required" });
    return;
  }
  try {
    const userId = req.authUser!.id;
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`privacy:${userId}`}))`,
      );
      const latest = await tx
        .selectDistinctOn([auditLogsTable.entityId])
        .from(auditLogsTable)
        .where(and(requestType, owner(userId)))
        .orderBy(
          asc(auditLogsTable.entityId),
          desc(auditLogsTable.createdAt),
          desc(auditLogsTable.id),
        );
      const pending = latest.find((row) => row.metadata?.status !== "resolved");
      if (pending) return { request: pending, existing: true };
      const [request] = await tx
        .insert(auditLogsTable)
        .values({
          createdAt: sql`clock_timestamp()`,
          actorUserId: userId,
          action: "privacy_deletion_requested",
          entityType: "privacy_request",
          entityId: randomUUID(),
          metadata: { userId, kind: "deletion", status: "requested" },
        })
        .returning();
      return { request, existing: false };
    });
    res.status(result.existing ? 200 : 201).json(result);
  } catch {
    res.status(500).json({ error: "privacy_request_failed" });
  }
});

router.get(
  "/admin/privacy/requests",
  requireRole("admin"),
  async (req, res) => {
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      res.status(400).json({ error: "invalid_offset" });
      return;
    }
    try {
      const requests = await db
        .selectDistinctOn([auditLogsTable.entityId])
        .from(auditLogsTable)
        .where(requestType)
        .orderBy(
          asc(auditLogsTable.entityId),
          desc(auditLogsTable.createdAt),
          desc(auditLogsTable.id),
        )
        .limit(101)
        .offset(offset);
      res.json({
        requests: requests.slice(0, 100),
        hasMore: requests.length > 100,
        nextOffset: offset + 100,
      });
    } catch {
      res.status(500).json({ error: "privacy_requests_fetch_failed" });
    }
  },
);

router.patch(
  "/admin/privacy/requests/:id",
  requireRole("admin"),
  async (req, res) => {
    const parsed = requestReviewSchema.safeParse(req.body);
    const id = String(req.params.id);
    if (
      !parsed.success ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      res.status(400).json({ error: "invalid_privacy_review" });
      return;
    }
    try {
      const result = await db.transaction(async (tx) => {
        // Resolve owner first, then serialize against that owner's submissions/reviews.
        const [initial] = await tx
          .select()
          .from(auditLogsTable)
          .where(and(requestType, eq(auditLogsTable.entityId, id)))
          .limit(1);
        if (!initial) return null;
        const userId = String(initial.metadata?.userId);
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`privacy:${userId}`}))`,
        );
        const [current] = await tx
          .select()
          .from(auditLogsTable)
          .where(and(requestType, eq(auditLogsTable.entityId, id)))
          .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
          .limit(1);
        if (current.metadata?.status === "resolved") return { conflict: true };
        const [request] = await tx
          .insert(auditLogsTable)
          .values({
            createdAt: sql`clock_timestamp()`,
            actorUserId: req.authUser!.id,
            action: "privacy_request_reviewed",
            entityType: "privacy_request",
            entityId: id,
            metadata: {
              userId,
              kind: "deletion",
              previousStatus: current.metadata?.status,
              ...parsed.data,
            },
          })
          .returning();
        return { request };
      });
      if (!result) {
        res.status(404).json({ error: "privacy_request_not_found" });
        return;
      }
      if ("conflict" in result) {
        res.status(409).json({ error: "privacy_request_already_resolved" });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: "privacy_review_failed" });
    }
  },
);
export default router;

import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, req.authUser!.id))
      .orderBy(desc(notificationsTable.createdAt));

    res.json({ notifications });
  } catch {
    res.status(500).json({ error: "notifications_fetch_failed" });
  }
});

router.patch("/notifications/:notificationId/read", requireAuth, async (req, res) => {
  try {
    const notificationId = String(req.params["notificationId"] ?? "");
    if (!notificationId) {
      res.status(400).json({ error: "notification_id_required" });
      return;
    }

    const [notification] = await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.userId, req.authUser!.id),
        ),
      )
      .returning();

    if (!notification) {
      res.status(404).json({ error: "notification_not_found" });
      return;
    }

    res.json({ notification });
  } catch {
    res.status(500).json({ error: "notification_update_failed" });
  }
});

export default router;

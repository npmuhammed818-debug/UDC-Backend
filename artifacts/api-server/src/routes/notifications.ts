import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, notificationPreferencesTable, notificationsTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireAuth } from "../auth/middleware";

const router: IRouter = Router();

const preferenceSchema = z
  .object({
    optionalInApp: z.boolean().optional(),
    optionalWhatsApp: z.boolean().optional(),
    reminders: z.boolean().optional(),
    announcements: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "at_least_one_preference_required");

const defaultPreferences = {
  optionalInApp: false,
  optionalWhatsApp: false,
  reminders: false,
  announcements: false,
};

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

router.get("/notifications/preferences", requireAuth, async (req, res) => {
  try {
    const [preferences] = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, req.authUser!.id))
      .limit(1);

    res.json({
      preferences: preferences
        ? {
            optionalInApp: preferences.optionalInApp,
            optionalWhatsApp: preferences.optionalWhatsApp,
            reminders: preferences.reminders,
            announcements: preferences.announcements,
          }
        : defaultPreferences,
      criticalNotificationsAlwaysOn: true,
    });
  } catch {
    res.status(500).json({ error: "notification_preferences_fetch_failed" });
  }
});

router.patch("/notifications/preferences", requireAuth, async (req, res) => {
  const parsed = preferenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_notification_preferences" });
    return;
  }

  try {
    const userId = req.authUser!.id;
    const [current] = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, userId))
      .limit(1);

    const next = { ...(current ?? defaultPreferences), ...parsed.data, updatedAt: new Date() };

    const [preferences] = await db
      .insert(notificationPreferencesTable)
      .values({
        userId,
        optionalInApp: next.optionalInApp,
        optionalWhatsApp: next.optionalWhatsApp,
        reminders: next.reminders,
        announcements: next.announcements,
      })
      .onConflictDoUpdate({
        target: notificationPreferencesTable.userId,
        set: {
          optionalInApp: next.optionalInApp,
          optionalWhatsApp: next.optionalWhatsApp,
          reminders: next.reminders,
          announcements: next.announcements,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json({
      preferences,
      criticalNotificationsAlwaysOn: true,
    });
  } catch {
    res.status(500).json({ error: "notification_preferences_update_failed" });
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

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "optional_in_app" boolean DEFAULT true NOT NULL,
  "optional_whatsapp" boolean DEFAULT true NOT NULL,
  "reminders" boolean DEFAULT true NOT NULL,
  "announcements" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_id_unique"
  ON "notification_preferences" ("user_id");

ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "notification_preferences" FROM anon, authenticated;

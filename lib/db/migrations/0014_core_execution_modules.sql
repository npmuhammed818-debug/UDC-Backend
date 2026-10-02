CREATE TABLE IF NOT EXISTS "deal_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "deal_id" uuid NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"), "scheduled_by" uuid REFERENCES "users"("id"),
  "status" text NOT NULL DEFAULT 'requested', "scheduled_at" timestamptz, "provider" text, "meeting_url" text,
  "agenda" text, "admin_notes" text, "completed_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "deal_meetings_deal_idx" ON "deal_meetings" ("deal_id");
CREATE INDEX IF NOT EXISTS "deal_meetings_status_idx" ON "deal_meetings" ("status");
CREATE INDEX IF NOT EXISTS "deal_meetings_scheduled_idx" ON "deal_meetings" ("scheduled_at");

CREATE TABLE IF NOT EXISTS "deal_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "deal_id" uuid NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
  "opened_by" uuid NOT NULL REFERENCES "users"("id"), "assigned_to" uuid REFERENCES "users"("id"),
  "case_type" text NOT NULL DEFAULT 'trade_issue', "priority" text NOT NULL DEFAULT 'normal', "status" text NOT NULL DEFAULT 'open',
  "summary" text NOT NULL, "resolution" text, "evidence" jsonb DEFAULT '[]'::jsonb, "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "deal_cases_deal_idx" ON "deal_cases" ("deal_id");
CREATE INDEX IF NOT EXISTS "deal_cases_status_idx" ON "deal_cases" ("status");
CREATE INDEX IF NOT EXISTS "deal_cases_assigned_idx" ON "deal_cases" ("assigned_to");

CREATE TABLE IF NOT EXISTS "customs_clearance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "deal_id" uuid NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'not_started', "country" text, "port" text, "broker_name" text, "reference" text, "notes" text,
  "cleared_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "customs_clearance_deal_unique" ON "customs_clearance" ("deal_id");
CREATE INDEX IF NOT EXISTS "customs_clearance_status_idx" ON "customs_clearance" ("status");

CREATE TABLE IF NOT EXISTS "deal_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "deal_id" uuid NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
  "author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "subject_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rating" text NOT NULL, "comment" text, "status" text NOT NULL DEFAULT 'pending_review',
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "deal_feedback_author_deal_unique" ON "deal_feedback" ("deal_id","author_user_id");
CREATE INDEX IF NOT EXISTS "deal_feedback_subject_idx" ON "deal_feedback" ("subject_user_id");
CREATE INDEX IF NOT EXISTS "deal_feedback_status_idx" ON "deal_feedback" ("status");

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['deal_meetings','deal_cases','customs_clearance','deal_feedback'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
END LOOP; END $$;

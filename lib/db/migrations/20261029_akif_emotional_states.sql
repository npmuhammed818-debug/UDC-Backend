-- REVIEW ONLY. Do not run against production without migration/backup approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.akif_emotional_states (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
 warmth double precision NOT NULL DEFAULT 0.5,
 grief double precision NOT NULL DEFAULT 0,
 tension double precision NOT NULL DEFAULT 0,
 trust double precision NOT NULL DEFAULT 0.5,
 engagement double precision NOT NULL DEFAULT 0.5,
 uncertainty double precision NOT NULL DEFAULT 0.3,
 last_trigger text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;

-- REVIEW ONLY. Do not run against production without migration/backup approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.akif_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 goal text NOT NULL,
 steps jsonb NOT NULL DEFAULT '[]',
 state text NOT NULL DEFAULT 'in_progress',
 source text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS akif_tasks_user_state_idx ON public.akif_tasks(user_id, state);
COMMIT;

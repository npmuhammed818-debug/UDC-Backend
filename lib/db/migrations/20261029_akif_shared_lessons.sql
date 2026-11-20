-- REVIEW ONLY. Do not run against production without migration/backup approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.akif_shared_lessons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 topic text NOT NULL,
 content text NOT NULL,
 origin text NOT NULL DEFAULT 'real',
 status text NOT NULL DEFAULT 'approved',
 review_note text,
 reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS akif_shared_lessons_status_idx ON public.akif_shared_lessons(status);
CREATE INDEX IF NOT EXISTS akif_shared_lessons_topic_idx ON public.akif_shared_lessons(topic);
COMMIT;

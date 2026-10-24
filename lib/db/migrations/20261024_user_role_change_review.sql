-- DRAFT / UNAPPLIED. Additive only. Do not apply without staging review.
BEGIN;
CREATE TABLE IF NOT EXISTS public.user_role_change_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 from_role text NOT NULL CHECK(from_role IN ('buyer','seller','agent')),
 to_role text NOT NULL CHECK(to_role IN ('buyer','seller','agent')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','rejected')),
 reviewer_user_id uuid REFERENCES public.users(id),
 review_note text CHECK(review_note IS NULL OR length(review_note)<=500),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT user_role_change_distinct CHECK(from_role<>to_role),
 CONSTRAINT user_role_change_review_consistency CHECK (
   (status='pending' AND reviewer_user_id IS NULL AND reviewed_at IS NULL)
   OR (status<>'pending' AND reviewer_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS user_role_change_pending_unique_idx
  ON public.user_role_change_requests(user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS user_role_change_requests_created_idx
  ON public.user_role_change_requests(created_at);
CREATE INDEX IF NOT EXISTS user_role_change_requests_user_idx
  ON public.user_role_change_requests(user_id);
ALTER TABLE public.user_role_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_role_change_requests FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   REVOKE ALL ON public.user_role_change_requests FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   REVOKE ALL ON public.user_role_change_requests FROM authenticated;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
   REVOKE ALL ON public.user_role_change_requests FROM service_role;
   GRANT SELECT,INSERT,UPDATE ON public.user_role_change_requests TO service_role;
 END IF;
END $$;
COMMIT;
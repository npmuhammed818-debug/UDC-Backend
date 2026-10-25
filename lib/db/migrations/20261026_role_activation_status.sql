-- DRAFT / UNAPPLIED. Role activation status, only after reviewed staging migration approval.
BEGIN;
ALTER TABLE public.user_role_change_requests
  DROP CONSTRAINT IF EXISTS user_role_change_requests_status_check;
ALTER TABLE public.user_role_change_requests
  ADD CONSTRAINT user_role_change_requests_status_check
  CHECK (status IN ('pending','reviewed','rejected','activated'));
-- Preserve existing review consistency constraint: activated is reviewed and timestamped.
COMMIT;

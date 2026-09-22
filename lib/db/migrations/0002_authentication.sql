BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.users
  ALTER COLUMN password_hash SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx
  ON public.auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
  ON public.auth_sessions (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON public.users (lower(email))
  WHERE email IS NOT NULL;

COMMIT;
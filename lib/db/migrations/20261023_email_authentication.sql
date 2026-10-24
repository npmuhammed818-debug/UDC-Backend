BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_recovery_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verified_email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
-- Do not infer password eligibility from password_hash: WhatsApp uses random hashes too.
CREATE TABLE IF NOT EXISTS public.email_auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_auth_user_purpose_idx ON public.email_auth_challenges(user_id,purpose);
CREATE INDEX IF NOT EXISTS email_auth_expires_idx ON public.email_auth_challenges(expires_at);
CREATE TABLE IF NOT EXISTS public.email_auth_limits (
  key text PRIMARY KEY,
  count integer NOT NULL CHECK (count > 0),
  window_start timestamptz NOT NULL,
  last_attempt_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS email_auth_limits_window_idx ON public.email_auth_limits(window_start);
ALTER TABLE public.email_auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_auth_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_auth_challenges, public.email_auth_limits FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.email_auth_challenges, public.email_auth_limits FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.email_auth_challenges, public.email_auth_limits FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- Revoke excessive grants from earlier QA migrations before applying the minimum.
    REVOKE ALL ON public.email_auth_challenges, public.email_auth_limits FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_auth_challenges, public.email_auth_limits TO service_role;
  END IF;
END $$;
-- Invalidate proof and outstanding codes even if an email is changed outside the API.
CREATE OR REPLACE FUNCTION public.invalidate_udc_email_proof() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF lower(coalesce(NEW.email,'')) IS DISTINCT FROM lower(coalesce(OLD.email,'')) THEN
    NEW.verified_email := NULL;
    NEW.email_verified_at := NULL;
    UPDATE public.email_auth_challenges SET consumed_at = coalesce(consumed_at, now()) WHERE user_id = OLD.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invalidate_udc_email_proof ON public.users;
CREATE TRIGGER invalidate_udc_email_proof BEFORE UPDATE OF email ON public.users
FOR EACH ROW EXECUTE FUNCTION public.invalidate_udc_email_proof();
COMMIT;

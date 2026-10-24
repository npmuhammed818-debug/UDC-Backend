
-- NON-PRODUCTION REVIEW REQUIRED: this migration is not applied by Drizzle push.
BEGIN;
CREATE TABLE IF NOT EXISTS public.whatsapp_phone_link_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  old_phone text,
  new_phone text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_phone_link_new_phone_idx
  ON public.whatsapp_phone_link_challenges(new_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_phone_link_user_created_idx
  ON public.whatsapp_phone_link_challenges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_phone_link_expiry_idx
  ON public.whatsapp_phone_link_challenges(expires_at);
ALTER TABLE public.whatsapp_phone_link_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_phone_link_challenges FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.whatsapp_phone_link_challenges FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.whatsapp_phone_link_challenges FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_phone_link_challenges TO service_role;
  END IF;
END $$;
COMMIT;

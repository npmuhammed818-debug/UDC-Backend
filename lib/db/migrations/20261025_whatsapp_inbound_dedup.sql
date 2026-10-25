-- Staging candidate only. Applying to a hosted database requires owner approval.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_dedup (
  id_hash text PRIMARY KEY NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS whatsapp_inbound_dedup_claimed_idx
  ON public.whatsapp_inbound_dedup (claimed_at);
ALTER TABLE public.whatsapp_inbound_dedup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_inbound_dedup FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.whatsapp_inbound_dedup FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.whatsapp_inbound_dedup FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON public.whatsapp_inbound_dedup FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_inbound_dedup TO service_role;
  END IF;
END $$;
COMMIT;

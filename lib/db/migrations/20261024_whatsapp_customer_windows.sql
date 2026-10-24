-- DRAFT, unapplied. Review staging backup/RLS before enabling WhatsApp send policy.
BEGIN;
CREATE TABLE IF NOT EXISTS public.whatsapp_customer_windows(
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  phone_fingerprint text NOT NULL CHECK(length(phone_fingerprint)=64),
  provider_message_fingerprint text NOT NULL CHECK(length(provider_message_fingerprint)=64),
  last_inbound_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_customer_windows_recent_idx
 ON public.whatsapp_customer_windows(last_inbound_at);
ALTER TABLE public.whatsapp_customer_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_customer_windows FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.whatsapp_customer_windows FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.whatsapp_customer_windows FROM authenticated;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  REVOKE ALL ON public.whatsapp_customer_windows FROM service_role;
  GRANT SELECT,INSERT,UPDATE ON public.whatsapp_customer_windows TO service_role;
 END IF;
END $$;
COMMIT;

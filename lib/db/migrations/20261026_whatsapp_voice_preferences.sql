-- Staging candidate only. Applying to a hosted database requires owner approval. Not applied by the developer.
-- Voice-reply notice and "text only" opt-out per WhatsApp user. Stores a SHA-256 of the phone, no number, text or audio.
-- Fail closed: if this table is missing the API sends text only and never speaks.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
CREATE TABLE IF NOT EXISTS public.whatsapp_voice_preferences (
  phone_hash text PRIMARY KEY NOT NULL,
  notice_sent_at timestamptz,
  text_only boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_voice_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_voice_preferences FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.whatsapp_voice_preferences FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.whatsapp_voice_preferences FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON public.whatsapp_voice_preferences FROM service_role;
    GRANT SELECT, INSERT, UPDATE ON public.whatsapp_voice_preferences TO service_role;
  END IF;
END $$;
COMMIT;

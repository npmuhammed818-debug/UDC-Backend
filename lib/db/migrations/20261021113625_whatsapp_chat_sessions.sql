BEGIN;
CREATE TABLE public.whatsapp_chat_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 phone_hash text NOT NULL UNIQUE,
 purpose text NOT NULL CHECK (purpose IN ('profile_buyer','profile_seller','profile_agent','buyer','seller')),
 step integer NOT NULL DEFAULT 0 CHECK (step >= 0 AND step <= 20),
 data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
 last_message_id text,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_chat_sessions_expiry_idx ON public.whatsapp_chat_sessions(expires_at);
ALTER TABLE public.whatsapp_chat_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_chat_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_chat_sessions TO service_role;
COMMIT;

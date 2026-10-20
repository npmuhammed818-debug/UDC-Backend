BEGIN;
CREATE TABLE public.whatsapp_signin_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  browser_token_hash text NOT NULL UNIQUE,
  requested_role text NOT NULL CHECK (requested_role IN ('buyer','seller','agent')),
  link_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  approved_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmation','approved','consumed')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_signin_expires_idx ON public.whatsapp_signin_challenges(expires_at);
ALTER TABLE public.whatsapp_signin_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_signin_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_signin_challenges TO service_role;
COMMIT;

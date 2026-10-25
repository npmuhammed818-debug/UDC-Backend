-- DRAFT, unapplied. Confidential document vault: single-use upload links, access log, deletion requests.
-- Review on dedicated staging only. No data is backfilled.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vault_upload_links(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vault_upload_links_user_idx ON public.vault_upload_links(user_id);
CREATE INDEX IF NOT EXISTS vault_upload_links_expiry_idx ON public.vault_upload_links(expires_at);
CREATE TABLE IF NOT EXISTS public.vault_access_log(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  document_id uuid REFERENCES public.company_verification_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vault_access_log_document_idx ON public.vault_access_log(document_id);
CREATE INDEX IF NOT EXISTS vault_access_log_actor_idx ON public.vault_access_log(actor_user_id);
CREATE TABLE IF NOT EXISTS public.vault_deletion_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.company_verification_documents(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','completed','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS vault_deletion_requests_document_idx ON public.vault_deletion_requests(document_id);
ALTER TABLE public.vault_upload_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vault_upload_links, public.vault_access_log, public.vault_deletion_requests FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.vault_upload_links, public.vault_access_log, public.vault_deletion_requests FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.vault_upload_links, public.vault_access_log, public.vault_deletion_requests FROM authenticated;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  REVOKE ALL ON public.vault_upload_links, public.vault_access_log, public.vault_deletion_requests FROM service_role;
  GRANT SELECT,INSERT,UPDATE ON public.vault_upload_links TO service_role;
  GRANT SELECT,INSERT ON public.vault_access_log TO service_role;   -- append-only: no UPDATE/DELETE
  GRANT SELECT,INSERT,UPDATE ON public.vault_deletion_requests TO service_role;
 END IF;
END $$;
COMMIT;

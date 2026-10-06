BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL,
  version text NOT NULL,
  file_url text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  lawyer_reference text,
  approved_by uuid NOT NULL REFERENCES public.users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_documents_type_status_idx
  ON public.platform_documents (document_type, status);
CREATE INDEX IF NOT EXISTS platform_documents_created_at_idx
  ON public.platform_documents (created_at);

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_platform_document_id uuid
  REFERENCES public.platform_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_source_platform_document_id_idx
  ON public.documents (source_platform_document_id);

ALTER TABLE public.platform_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_documents FROM anon, authenticated;

COMMIT;

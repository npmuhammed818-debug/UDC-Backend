BEGIN;

CREATE TABLE IF NOT EXISTS public.company_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.users(id),
  document_type text NOT NULL,
  file_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_verification_documents_company_idx
  ON public.company_verification_documents(company_id);
CREATE INDEX IF NOT EXISTS company_verification_documents_status_idx
  ON public.company_verification_documents(status);
CREATE INDEX IF NOT EXISTS company_verification_documents_uploaded_by_idx
  ON public.company_verification_documents(uploaded_by);

ALTER TABLE public.company_verification_documents ENABLE ROW LEVEL SECURITY;

COMMIT;

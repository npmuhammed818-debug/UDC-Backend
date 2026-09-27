-- Keep unfinished WhatsApp trade intake conversational across messages.
CREATE TABLE IF NOT EXISTS public.whatsapp_intake_drafts (
  phone text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('buyer', 'seller')),
  full_name text,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_provider_message_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_intake_drafts_last_provider_message_id_unique
  ON public.whatsapp_intake_drafts(last_provider_message_id)
  WHERE last_provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_intake_drafts_updated_at_idx
  ON public.whatsapp_intake_drafts(updated_at);

ALTER TABLE public.whatsapp_intake_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_intake_drafts FROM anon, authenticated;

-- UDC's transaction workflow uses DLC only.
ALTER TABLE public.deal_financials
  DROP CONSTRAINT IF EXISTS deal_financials_instrument_check;

ALTER TABLE public.deal_financials
  DROP CONSTRAINT IF EXISTS deal_financials_dlc_only;

ALTER TABLE public.deal_financials
  ADD CONSTRAINT deal_financials_dlc_only
  CHECK (instrument_type = 'DLC');

ALTER TABLE public.deal_financials
  DROP CONSTRAINT IF EXISTS deal_financials_status_check;

ALTER TABLE public.deal_financials
  ADD CONSTRAINT deal_financials_status_check
  CHECK (status IN ('not_started', 'requested', 'pending', 'received', 'confirmed', 'rejected', 'cancelled'));

ALTER TABLE public.deal_financials
  ALTER COLUMN terms SET DEFAULT 'Release after SGS inspection at destination';

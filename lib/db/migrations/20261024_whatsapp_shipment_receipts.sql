-- DRAFT ONLY: additive after 20261024_whatsapp_shipment_outbox.sql.
-- Never apply to production without owner-approved staging/backup review.
BEGIN;
ALTER TABLE public.whatsapp_shipment_outbox
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'unconfirmed',
  ADD COLUMN IF NOT EXISTS provider_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='whatsapp_shipment_outbox_delivery_status_check') THEN
  ALTER TABLE public.whatsapp_shipment_outbox
   ADD CONSTRAINT whatsapp_shipment_outbox_delivery_status_check
     CHECK(delivery_status IN ('unconfirmed','sent','delivered','read','failed'));
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_shipment_outbox_provider_id_unique
 ON public.whatsapp_shipment_outbox(provider_message_id)
 WHERE provider_message_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.whatsapp_shipment_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_message_id text NOT NULL CHECK(length(provider_message_id) BETWEEN 5 AND 255),
 provider_status text NOT NULL CHECK(provider_status IN ('sent','delivered','read','failed')),
 recipient_fingerprint text NOT NULL CHECK(length(recipient_fingerprint)=64),
 provider_timestamp timestamptz NOT NULL,
 applied_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_shipment_receipt_event_unique
 ON public.whatsapp_shipment_receipts(provider_message_id,provider_status,provider_timestamp);
CREATE INDEX IF NOT EXISTS whatsapp_shipment_receipt_unapplied_idx
 ON public.whatsapp_shipment_receipts(applied_at,created_at);
ALTER TABLE public.whatsapp_shipment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_shipment_receipts FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.whatsapp_shipment_receipts FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.whatsapp_shipment_receipts FROM authenticated;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  REVOKE ALL ON public.whatsapp_shipment_receipts FROM service_role;
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.whatsapp_shipment_receipts TO service_role;
 END IF;
END $$;
COMMIT;

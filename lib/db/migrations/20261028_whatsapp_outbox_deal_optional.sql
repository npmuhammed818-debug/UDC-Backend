-- DRAFT FOR REVIEW. Not applied anywhere yet.
-- Lets the WhatsApp shipment outbox carry user-initiated jobs that have no deal
-- (shipment watch updates). No existing rows change; no other table is touched.
BEGIN;
ALTER TABLE public.whatsapp_shipment_outbox ALTER COLUMN deal_id DROP NOT NULL;
COMMIT;

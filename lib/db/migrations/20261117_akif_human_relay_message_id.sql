-- Add message_id to the AKIF human-relay held queue so the outbound
-- reservation ledger can key relay covers on the stable WhatsApp message id
-- (wamid) across restarts, instead of falling back to normalized text.
-- Additive only: one nullable column, no changes to existing data.
BEGIN;

ALTER TABLE public.akif_human_relay_items
  ADD COLUMN IF NOT EXISTS message_id text;

COMMIT;

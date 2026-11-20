-- 20 Nov 2026: passive webhook diagnostic, staging flag UDC_WHATSAPP_DIAG_RECEIPTS.
-- Receipts are content-free (payload class / item count / handler outcome / signed
-- flag only). The dedup failure columns record where a claimed inbound message
-- stopped and the error class - no message content, phone numbers or provider ids.
-- All changes are additive and nullable; rollback is DROP TABLE / DROP COLUMN.
CREATE TABLE IF NOT EXISTS whatsapp_webhook_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_class text NOT NULL,
  item_count integer NOT NULL,
  handler_outcome text NOT NULL,
  signed boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS whatsapp_webhook_receipts_received_idx ON whatsapp_webhook_receipts (received_at);

ALTER TABLE whatsapp_inbound_dedup ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE whatsapp_inbound_dedup ADD COLUMN IF NOT EXISTS failed_stage text;
ALTER TABLE whatsapp_inbound_dedup ADD COLUMN IF NOT EXISTS error_class text;

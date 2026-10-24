-- DRAFT / NOT APPLIED. Apply only after #131 and #133 migrations in staging.
-- A timed-out provider request may have been accepted: never blindly resend it.
BEGIN;
CREATE TABLE IF NOT EXISTS public.whatsapp_shipment_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','leased','retry','accepted','uncertain','cancelled','failed','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  lease_until timestamptz,
  provider_message_id text,
  last_failure_category text CHECK(last_failure_category IN
    ('configuration_missing','recipient_ineligible','policy_unverified','provider_rejected',
      'provider_outcome_unknown','retryable_preflight_error','attempt_limit')),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_shipment_outbox_claim_consistency CHECK(
    (status='leased' AND claim_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status<>'leased' AND claim_token IS NULL AND lease_until IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_shipment_outbox_notification_unique
 ON public.whatsapp_shipment_outbox(notification_id);
CREATE INDEX IF NOT EXISTS whatsapp_shipment_outbox_next_idx
 ON public.whatsapp_shipment_outbox(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS whatsapp_shipment_outbox_recipient_idx
 ON public.whatsapp_shipment_outbox(recipient_user_id);
ALTER TABLE public.whatsapp_shipment_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_shipment_outbox FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.whatsapp_shipment_outbox FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.whatsapp_shipment_outbox FROM authenticated;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  REVOKE ALL ON public.whatsapp_shipment_outbox FROM service_role;
  GRANT SELECT,INSERT,UPDATE ON public.whatsapp_shipment_outbox TO service_role;
 END IF;
END $$;
COMMIT;

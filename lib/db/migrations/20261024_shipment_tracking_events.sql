-- REVIEW ONLY. Do not run against production without migration/backup approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shipment_tracking_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
 deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
 idempotency_key uuid NOT NULL UNIQUE,
 kind text NOT NULL CHECK (kind IN ('planned','booked','departed','in_transit','arrived','customs','inspection','delivered','delay','exception','status_update')),
 shipment_status text,
 location text,
 note text,
 source text NOT NULL DEFAULT 'udc_manual' CHECK(source IN ('udc_manual','carrier_reported','document_checked')),
 source_reference text,
 occurred_at timestamptz NOT NULL,
 recorded_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipment_tracking_events_shipment_time_idx ON public.shipment_tracking_events(shipment_id,occurred_at);
CREATE INDEX IF NOT EXISTS shipment_tracking_events_deal_time_idx ON public.shipment_tracking_events(deal_id,occurred_at);
ALTER TABLE public.shipment_tracking_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipment_tracking_events FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.shipment_tracking_events FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.shipment_tracking_events FROM authenticated;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT SELECT,INSERT ON public.shipment_tracking_events TO service_role;
 END IF;
END $$;
COMMIT;

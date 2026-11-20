-- REVIEW ONLY. Do not run against production without migration/backup approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shipment_watches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
 tracking_number text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 last_fingerprint text,
 last_class text,
 last_polled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_watches_user_number_idx ON public.shipment_watches(user_id, tracking_number);
CREATE INDEX IF NOT EXISTS shipment_watches_active_idx ON public.shipment_watches(active);
COMMIT;

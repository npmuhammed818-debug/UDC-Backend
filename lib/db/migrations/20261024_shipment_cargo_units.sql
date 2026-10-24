-- DRAFT / UNAPPLIED. Requires staging, backup, DBA review and launch approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shipment_cargo_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  transport_mode text NOT NULL CHECK(transport_mode IN ('sea','air','road')),
  unit_reference text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','booked','in_transit','arrived','delivered','cancelled','on_hold')),
  vessel_name text,
  voyage_number text,
  flight_number text,
  vehicle_reference text,
  bill_of_lading text,
  air_waybill text,
  current_location text,
  last_update_source text NOT NULL DEFAULT 'udc_manual' CHECK(last_update_source IN ('udc_manual','carrier_reported','document_checked')),
  last_reported_at timestamptz,
  estimated_arrival timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_cargo_units_ref_unique ON public.shipment_cargo_units(shipment_id,unit_reference);
CREATE INDEX IF NOT EXISTS shipment_cargo_units_deal_idx ON public.shipment_cargo_units(deal_id);
CREATE INDEX IF NOT EXISTS shipment_cargo_units_eta_idx ON public.shipment_cargo_units(estimated_arrival);
CREATE INDEX IF NOT EXISTS shipment_cargo_units_shipment_idx ON public.shipment_cargo_units(shipment_id);
ALTER TABLE public.shipment_cargo_units ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipment_cargo_units FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.shipment_cargo_units FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON public.shipment_cargo_units FROM authenticated;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT SELECT, INSERT, UPDATE ON public.shipment_cargo_units TO service_role;
 END IF;
END $$;
COMMIT;

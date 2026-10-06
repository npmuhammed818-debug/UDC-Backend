BEGIN;

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS container_number text,
  ADD COLUMN IF NOT EXISTS vessel_name text,
  ADD COLUMN IF NOT EXISTS voyage_number text,
  ADD COLUMN IF NOT EXISTS port_of_loading text,
  ADD COLUMN IF NOT EXISTS current_port text,
  ADD COLUMN IF NOT EXISTS next_port text,
  ADD COLUMN IF NOT EXISTS port_of_discharge text,
  ADD COLUMN IF NOT EXISTS departed_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_carrier_event text,
  ADD COLUMN IF NOT EXISTS last_carrier_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS delay_reason text;

ALTER TABLE public.shipments
  DROP CONSTRAINT IF EXISTS shipments_status_check;

ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_status_check
  CHECK (status IN ('planned', 'booked', 'in_transit', 'delayed', 'arrived', 'delivered', 'cancelled'));

CREATE INDEX IF NOT EXISTS shipments_container_number_idx
  ON public.shipments (container_number);

COMMIT;

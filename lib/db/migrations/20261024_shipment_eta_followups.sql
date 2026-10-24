-- REVIEW ONLY / UNAPPLIED. Must follow shipment_cargo_units migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shipment_eta_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cargo_unit_id uuid NOT NULL REFERENCES public.shipment_cargo_units(id) ON DELETE CASCADE,
 deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK (reason IN ('overdue_unconfirmed','last_report_stale')),
 day_key date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_eta_followups_unique_day_idx
 ON public.shipment_eta_followups(cargo_unit_id,reason,day_key);
CREATE INDEX IF NOT EXISTS shipment_eta_followups_deal_idx
 ON public.shipment_eta_followups(deal_id);
ALTER TABLE public.shipment_eta_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipment_eta_followups FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   REVOKE ALL ON public.shipment_eta_followups FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   REVOKE ALL ON public.shipment_eta_followups FROM authenticated;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
   REVOKE ALL ON public.shipment_eta_followups FROM service_role;
   GRANT SELECT,INSERT ON public.shipment_eta_followups TO service_role;
 END IF;
END $$;
COMMIT;

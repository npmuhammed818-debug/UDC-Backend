
-- NON-PRODUCTION REVIEW REQUIRED: this migration is not applied by Drizzle push.
-- These server-only AKIF tables already exist on the hosted staging database
-- (created outside migration history; only the grants migration 0013 referenced
-- them). This migration records their canonical definitions so fresh
-- environments create the same schema. CREATE TABLE IF NOT EXISTS makes it a
-- no-op on databases that already have them.
BEGIN;

CREATE TABLE IF NOT EXISTS public.akif_collection_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.akif_data_sources(id) ON DELETE CASCADE,
  reporter text NOT NULL,
  year text NOT NULL,
  partner text NOT NULL DEFAULT 'WLD'::text,
  product text NOT NULL DEFAULT 'ALL'::text,
  indicator text NOT NULL DEFAULT 'MPRT-TRD-VL'::text,
  status text NOT NULL DEFAULT 'pending'::text
    CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT akif_collection_queue_source_id_reporter_year_partner_produ_key
    UNIQUE (source_id, reporter, year, partner, product, indicator)
);
CREATE INDEX IF NOT EXISTS akif_collection_queue_pending_idx
  ON public.akif_collection_queue(status, scheduled_for);

CREATE TABLE IF NOT EXISTS public.akif_collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.akif_data_sources(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'::text
    CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'partial'::text])),
  records_seen integer NOT NULL DEFAULT 0,
  records_inserted integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  error_message text
);
CREATE INDEX IF NOT EXISTS akif_collection_runs_source_fk_idx
  ON public.akif_collection_runs(source_id);

CREATE TABLE IF NOT EXISTS public.akif_product_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.akif_products(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_normalized text NOT NULL,
  language text DEFAULT 'en'::text,
  source_id uuid REFERENCES public.akif_data_sources(id) ON DELETE SET NULL,
  confidence numeric CHECK (confidence >= 0::numeric AND confidence <= 1::numeric),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT akif_product_aliases_product_id_alias_normalized_key
    UNIQUE (product_id, alias_normalized)
);
CREATE INDEX IF NOT EXISTS akif_product_aliases_lookup_idx
  ON public.akif_product_aliases(alias_normalized);

DO $$ BEGIN
  IF to_regclass('public.akif_collection_queue') IS NOT NULL THEN
    ALTER TABLE public.akif_collection_queue ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.akif_collection_runs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.akif_product_aliases ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.akif_collection_queue FROM PUBLIC;
    REVOKE ALL ON public.akif_collection_runs FROM PUBLIC;
    REVOKE ALL ON public.akif_product_aliases FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      REVOKE ALL ON public.akif_collection_queue FROM anon;
      REVOKE ALL ON public.akif_collection_runs FROM anon;
      REVOKE ALL ON public.akif_product_aliases FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      REVOKE ALL ON public.akif_collection_queue FROM authenticated;
      REVOKE ALL ON public.akif_collection_runs FROM authenticated;
      REVOKE ALL ON public.akif_product_aliases FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      REVOKE ALL ON public.akif_collection_queue FROM service_role;
      REVOKE ALL ON public.akif_collection_runs FROM service_role;
      REVOKE ALL ON public.akif_product_aliases FROM service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.akif_collection_queue TO service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.akif_collection_runs TO service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.akif_product_aliases TO service_role;
    END IF;
  END IF;
END $$;

COMMIT;

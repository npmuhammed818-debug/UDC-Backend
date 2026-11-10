-- Persists the AKIF human-relay held queue so a deploy or restart no longer
-- drops held customer messages (two held messages lost on the #509 deploy,
-- 10 Nov). Additive only: one new table, no changes to existing tables/data.
-- Columns mirror the in-memory HumanRelayItem one to one.
BEGIN;

CREATE TABLE IF NOT EXISTS public.akif_human_relay_items (
  id text PRIMARY KEY,
  phone text NOT NULL,
  at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text','voice')),
  text text NOT NULL,
  heard_language text,
  draft text,
  draft_background_discarded boolean NOT NULL DEFAULT false,
  answered_at timestamptz,
  auto_answered boolean NOT NULL DEFAULT false,
  auto_note text,
  claimed_by text,
  claimed_at timestamptz,
  customer_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS akif_human_relay_items_open_idx
  ON public.akif_human_relay_items(phone) WHERE answered_at IS NULL;
CREATE INDEX IF NOT EXISTS akif_human_relay_items_at_idx
  ON public.akif_human_relay_items(at);

COMMIT;

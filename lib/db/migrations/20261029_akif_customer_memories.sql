-- REVIEW ONLY. Do not run against production without migration/backup approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.akif_customer_memories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
 kind text NOT NULL,
 content text NOT NULL,
 source text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS akif_customer_memories_user_status_idx ON public.akif_customer_memories(user_id, status);
CREATE INDEX IF NOT EXISTS akif_customer_memories_user_deal_idx ON public.akif_customer_memories(user_id, deal_id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS akif_learning_opt_in boolean NOT NULL DEFAULT false;
COMMIT;

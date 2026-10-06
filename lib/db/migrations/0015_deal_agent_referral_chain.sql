BEGIN;

ALTER TABLE public.deal_participants
  ADD COLUMN IF NOT EXISTS referred_by_agent_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_position integer,
  ADD COLUMN IF NOT EXISTS commission_share_pct numeric(6, 3);

WITH ranked_agents AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY deal_id ORDER BY created_at, id)::int AS referral_position
  FROM public.deal_participants
  WHERE participant_role = 'agent'
)
UPDATE public.deal_participants AS participant
SET referral_position = ranked_agents.referral_position
FROM ranked_agents
WHERE participant.id = ranked_agents.id
  AND participant.referral_position IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_participants_referral_position_check'
  ) THEN
    ALTER TABLE public.deal_participants
      ADD CONSTRAINT deal_participants_referral_position_check
      CHECK (referral_position IS NULL OR referral_position >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_participants_commission_share_check'
  ) THEN
    ALTER TABLE public.deal_participants
      ADD CONSTRAINT deal_participants_commission_share_check
      CHECK (commission_share_pct IS NULL OR (commission_share_pct >= 0 AND commission_share_pct <= 100));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS deal_participants_referrer_idx
  ON public.deal_participants (referred_by_agent_user_id);
CREATE INDEX IF NOT EXISTS deal_participants_chain_idx
  ON public.deal_participants (deal_id, referral_position);
CREATE UNIQUE INDEX IF NOT EXISTS deal_participants_agent_position_unique
  ON public.deal_participants (deal_id, referral_position)
  WHERE participant_role = 'agent' AND referral_position IS NOT NULL;

COMMIT;

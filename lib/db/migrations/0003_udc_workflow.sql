BEGIN;

CREATE TABLE IF NOT EXISTS public.deal_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_participants_role_check
    CHECK (participant_role IN ('buyer', 'seller', 'agent', 'inspector', 'observer')),
  CONSTRAINT deal_participants_status_check
    CHECK (status IN ('invited', 'active', 'removed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS deal_participants_deal_user_role_unique
  ON public.deal_participants (deal_id, user_id, participant_role);
CREATE INDEX IF NOT EXISTS deal_participants_deal_id_idx
  ON public.deal_participants (deal_id);
CREATE INDEX IF NOT EXISTS deal_participants_user_id_idx
  ON public.deal_participants (user_id);

CREATE TABLE IF NOT EXISTS public.document_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  access_role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_access_role_check
    CHECK (access_role IN ('viewer', 'editor', 'reviewer'))
);
CREATE UNIQUE INDEX IF NOT EXISTS document_access_document_user_unique
  ON public.document_access (document_id, user_id);
CREATE INDEX IF NOT EXISTS document_access_user_id_idx
  ON public.document_access (user_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx
  ON public.notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id uuid NOT NULL REFERENCES public.users(id),
  referred_user_id uuid NOT NULL REFERENCES public.users(id),
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  commission_rate numeric(6, 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_status_check
    CHECK (status IN ('pending', 'qualified', 'paid', 'cancelled')),
  CONSTRAINT referrals_rate_check
    CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100))
);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_user_unique
  ON public.referrals (referred_user_id);
CREATE INDEX IF NOT EXISTS referrals_agent_user_id_idx
  ON public.referrals (agent_user_id);
CREATE INDEX IF NOT EXISTS referrals_code_idx
  ON public.referrals (referral_code);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_user_id_idx
  ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at);

CREATE TABLE IF NOT EXISTS public.deal_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  instrument_type text NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  amount numeric(18, 2),
  currency text NOT NULL DEFAULT 'USD',
  terms text,
  reference text,
  provider text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_financials_instrument_check
    CHECK (instrument_type IN ('payment_plan', 'lc', 'dlc', 'escrow_reference')),
  CONSTRAINT deal_financials_status_check
    CHECK (status IN ('not_started', 'requested', 'documented', 'verified', 'completed', 'cancelled')),
  CONSTRAINT deal_financials_amount_check
    CHECK (amount IS NULL OR amount >= 0)
);
CREATE INDEX IF NOT EXISTS deal_financials_deal_id_idx
  ON public.deal_financials (deal_id);
CREATE INDEX IF NOT EXISTS deal_financials_status_idx
  ON public.deal_financials (status);

CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  carrier text,
  tracking_number text,
  status text NOT NULL DEFAULT 'planned',
  origin text,
  destination text,
  estimated_arrival timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipments_status_check
    CHECK (status IN ('planned', 'booked', 'in_transit', 'delivered', 'delayed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS shipments_deal_id_idx
  ON public.shipments (deal_id);
CREATE INDEX IF NOT EXISTS shipments_tracking_number_idx
  ON public.shipments (tracking_number);
CREATE INDEX IF NOT EXISTS shipments_status_idx
  ON public.shipments (status);

CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id),
  inspector_name text,
  status text NOT NULL DEFAULT 'requested',
  scheduled_at timestamptz,
  result_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspections_status_check
    CHECK (status IN ('requested', 'scheduled', 'in_progress', 'passed', 'failed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS inspections_deal_id_idx
  ON public.inspections (deal_id);
CREATE INDEX IF NOT EXISTS inspections_status_idx
  ON public.inspections (status);

COMMIT;
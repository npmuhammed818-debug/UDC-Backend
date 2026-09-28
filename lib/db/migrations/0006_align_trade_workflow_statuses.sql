-- Align existing checks with the admin-reviewed trade workflow.
-- Preserve legacy states for rows created before this workflow.
BEGIN;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_status_check
  CHECK (status IN ('pending', 'active', 'under_review', 'verified', 'rejected', 'suspended', 'inactive'));

ALTER TABLE public.buyer_requests DROP CONSTRAINT IF EXISTS buyer_requests_status_check;
ALTER TABLE public.buyer_requests ADD CONSTRAINT buyer_requests_status_check
  CHECK (status IN ('open', 'pending_admin_review', 'approved', 'rejected', 'matched', 'negotiating', 'converted', 'cancelled'));

ALTER TABLE public.seller_listings DROP CONSTRAINT IF EXISTS seller_listings_status_check;
ALTER TABLE public.seller_listings ADD CONSTRAINT seller_listings_status_check
  CHECK (status IN ('draft', 'pending_verification', 'pending_admin_review', 'approved', 'rejected', 'active', 'paused', 'sold', 'cancelled'));

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('suggested', 'accepted', 'approved', 'rejected', 'expired'));

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_status_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_status_check
  CHECK (status IN (
    'initiated', 'negotiating', 'negotiation', 'verification', 'loi', 'icpo', 'fco_sco',
    'contract', 'banking', 'payment_pending', 'payment_secured', 'inspection',
    'loading', 'shipment', 'delivery', 'payment', 'commission', 'completed',
    'on_hold', 'cancelled', 'rejected', 'disputed'
  ));

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('pending', 'verified', 'approved', 'rejected'));

COMMIT;

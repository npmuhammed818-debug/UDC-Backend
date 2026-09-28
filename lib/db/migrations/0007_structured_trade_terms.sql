-- Capture the commercial details buyers and sellers need for review and matching.
BEGIN;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS specification text,
  ADD COLUMN IF NOT EXISTS contract_duration text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS inspection_requirements text,
  ADD COLUMN IF NOT EXISTS additional_conditions text;

ALTER TABLE public.seller_listings
  DROP CONSTRAINT IF EXISTS seller_listings_monthly_capacity_positive,
  DROP CONSTRAINT IF EXISTS seller_listings_minimum_order_quantity_positive;

ALTER TABLE public.seller_listings
  ADD COLUMN IF NOT EXISTS specification text,
  ADD COLUMN IF NOT EXISTS monthly_capacity numeric(20, 6),
  ADD COLUMN IF NOT EXISTS minimum_order_quantity numeric(20, 6),
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS inspection_terms text,
  ADD COLUMN IF NOT EXISTS availability text;

ALTER TABLE public.seller_listings
  ADD CONSTRAINT seller_listings_monthly_capacity_positive
    CHECK (monthly_capacity IS NULL OR monthly_capacity > 0),
  ADD CONSTRAINT seller_listings_minimum_order_quantity_positive
    CHECK (minimum_order_quantity IS NULL OR minimum_order_quantity > 0);

COMMIT;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Existing users table: add the canonical UDC fields without removing legacy fields.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'buyer',
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON public.users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON public.users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_role_idx ON public.users (role);
CREATE INDEX IF NOT EXISTS users_status_idx ON public.users (status);

-- Existing products table: preserve grade and add canonical catalog fields.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS hs_code text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.products
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS products_name_idx ON public.products (name);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products (category);
CREATE INDEX IF NOT EXISTS products_hs_code_idx ON public.products (hs_code);

-- Existing deals table: preserve legacy inquiry/buyer/seller/agent relationships.
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS buyer_user_id uuid,
  ADD COLUMN IF NOT EXISTS seller_user_id uuid,
  ADD COLUMN IF NOT EXISTS buyer_request_id uuid,
  ADD COLUMN IF NOT EXISTS seller_listing_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS quantity numeric(20, 6),
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS agreed_price numeric(18, 2),
  ADD COLUMN IF NOT EXISTS incoterm text,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.deals
  ALTER COLUMN deal_number SET DEFAULT concat(
    'UDC-',
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  ALTER COLUMN status SET DEFAULT 'initiated',
  ALTER COLUMN buyer_user_id SET NOT NULL,
  ALTER COLUMN seller_user_id SET NOT NULL,
  ALTER COLUMN product_id SET NOT NULL,
  ALTER COLUMN quantity SET NOT NULL,
  ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN agreed_price SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS deals_buyer_user_id_idx
  ON public.deals (buyer_user_id);
CREATE INDEX IF NOT EXISTS deals_seller_user_id_idx
  ON public.deals (seller_user_id);
CREATE INDEX IF NOT EXISTS deals_buyer_request_id_idx
  ON public.deals (buyer_request_id);
CREATE INDEX IF NOT EXISTS deals_seller_listing_id_idx
  ON public.deals (seller_listing_id);
CREATE INDEX IF NOT EXISTS deals_product_id_idx ON public.deals (product_id);
CREATE INDEX IF NOT EXISTS deals_status_idx ON public.deals (status);

-- Existing documents table: add lifecycle tracking and timestamps.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.documents
  ALTER COLUMN document_type SET NOT NULL,
  ALTER COLUMN file_url SET NOT NULL,
  ALTER COLUMN deal_id SET NOT NULL,
  ALTER COLUMN uploaded_by SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS documents_deal_id_idx ON public.documents (deal_id);
CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx
  ON public.documents (uploaded_by);
CREATE INDEX IF NOT EXISTS documents_status_idx ON public.documents (status);
CREATE INDEX IF NOT EXISTS documents_document_type_idx
  ON public.documents (document_type);

-- Existing commissions table: retain legacy agent/rate fields and add canonical fields.
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS beneficiary_user_id uuid,
  ADD COLUMN IF NOT EXISTS amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.commissions
  ALTER COLUMN deal_id SET NOT NULL,
  ALTER COLUMN beneficiary_user_id SET NOT NULL,
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'USD',
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS commissions_deal_id_idx
  ON public.commissions (deal_id);
CREATE INDEX IF NOT EXISTS commissions_beneficiary_user_id_idx
  ON public.commissions (beneficiary_user_id);
CREATE INDEX IF NOT EXISTS commissions_status_idx
  ON public.commissions (status);

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id),
  company_name text NOT NULL,
  registration_number text,
  country text,
  address text,
  website text,
  verification_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seller_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id uuid NOT NULL REFERENCES public.users(id),
  company_id uuid REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric(20, 6) NOT NULL,
  unit text NOT NULL,
  price numeric(18, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  incoterm text,
  origin_country text,
  destination text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_listings_quantity_positive CHECK (quantity > 0),
  CONSTRAINT seller_listings_price_nonnegative CHECK (price >= 0)
);

CREATE TABLE IF NOT EXISTS public.buyer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id uuid NOT NULL REFERENCES public.users(id),
  company_id uuid REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  target_price numeric(18, 2),
  currency text NOT NULL DEFAULT 'USD',
  quantity numeric(20, 6) NOT NULL,
  unit text NOT NULL,
  destination text NOT NULL,
  preferred_incoterm text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buyer_requests_quantity_positive CHECK (quantity > 0),
  CONSTRAINT buyer_requests_target_price_nonnegative
    CHECK (target_price IS NULL OR target_price >= 0)
);

CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_request_id uuid NOT NULL REFERENCES public.buyer_requests(id),
  seller_listing_id uuid NOT NULL REFERENCES public.seller_listings(id),
  match_score numeric(5, 2),
  status text NOT NULL DEFAULT 'suggested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_score_range
    CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 100))
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id),
  sender_user_id uuid NOT NULL REFERENCES public.users(id),
  receiver_user_id uuid NOT NULL REFERENCES public.users(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_registration_number_unique
  ON public.companies (registration_number)
  WHERE registration_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_owner_user_id_idx
  ON public.companies (owner_user_id);
CREATE INDEX IF NOT EXISTS companies_verification_status_idx
  ON public.companies (verification_status);

CREATE INDEX IF NOT EXISTS seller_listings_seller_user_id_idx
  ON public.seller_listings (seller_user_id);
CREATE INDEX IF NOT EXISTS seller_listings_company_id_idx
  ON public.seller_listings (company_id);
CREATE INDEX IF NOT EXISTS seller_listings_product_id_idx
  ON public.seller_listings (product_id);
CREATE INDEX IF NOT EXISTS seller_listings_status_idx
  ON public.seller_listings (status);
CREATE INDEX IF NOT EXISTS seller_listings_origin_country_idx
  ON public.seller_listings (origin_country);

CREATE INDEX IF NOT EXISTS buyer_requests_buyer_user_id_idx
  ON public.buyer_requests (buyer_user_id);
CREATE INDEX IF NOT EXISTS buyer_requests_company_id_idx
  ON public.buyer_requests (company_id);
CREATE INDEX IF NOT EXISTS buyer_requests_product_id_idx
  ON public.buyer_requests (product_id);
CREATE INDEX IF NOT EXISTS buyer_requests_status_idx
  ON public.buyer_requests (status);
CREATE INDEX IF NOT EXISTS buyer_requests_destination_idx
  ON public.buyer_requests (destination);

CREATE UNIQUE INDEX IF NOT EXISTS matches_request_listing_unique
  ON public.matches (buyer_request_id, seller_listing_id);
CREATE INDEX IF NOT EXISTS matches_buyer_request_id_idx
  ON public.matches (buyer_request_id);
CREATE INDEX IF NOT EXISTS matches_seller_listing_id_idx
  ON public.matches (seller_listing_id);
CREATE INDEX IF NOT EXISTS matches_status_idx ON public.matches (status);

CREATE INDEX IF NOT EXISTS messages_deal_id_created_at_idx
  ON public.messages (deal_id, created_at);
CREATE INDEX IF NOT EXISTS messages_sender_user_id_idx
  ON public.messages (sender_user_id);
CREATE INDEX IF NOT EXISTS messages_receiver_user_id_idx
  ON public.messages (receiver_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role IN ('buyer', 'seller', 'agent', 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_status_check'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_status_check
      CHECK (status IN ('pending', 'active', 'suspended', 'inactive'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_verification_status_check'
  ) THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_verification_status_check
      CHECK (verification_status IN ('pending', 'verified', 'rejected'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seller_listings_status_check'
  ) THEN
    ALTER TABLE public.seller_listings ADD CONSTRAINT seller_listings_status_check
      CHECK (status IN ('draft', 'pending_verification', 'active', 'paused', 'sold', 'cancelled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'buyer_requests_status_check'
  ) THEN
    ALTER TABLE public.buyer_requests ADD CONSTRAINT buyer_requests_status_check
      CHECK (status IN ('open', 'matched', 'negotiating', 'converted', 'cancelled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matches_status_check'
  ) THEN
    ALTER TABLE public.matches ADD CONSTRAINT matches_status_check
      CHECK (status IN ('suggested', 'accepted', 'rejected', 'expired'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deals_status_check'
  ) THEN
    ALTER TABLE public.deals ADD CONSTRAINT deals_status_check
      CHECK (status IN (
        'initiated', 'negotiating', 'verification', 'payment_pending',
        'payment_secured', 'inspection', 'shipment', 'completed',
        'cancelled', 'disputed', 'negotiation'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_status_check'
  ) THEN
    ALTER TABLE public.documents ADD CONSTRAINT documents_status_check
      CHECK (status IN ('pending', 'verified', 'rejected'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_document_type_check'
  ) THEN
    ALTER TABLE public.documents ADD CONSTRAINT documents_document_type_check
      CHECK (document_type IN (
        'company_registration', 'business_license', 'certificate', 'invoice',
        'packing_list', 'bill_of_lading', 'inspection_report',
        'certificate_of_origin', 'other'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commissions_status_check'
  ) THEN
    ALTER TABLE public.commissions ADD CONSTRAINT commissions_status_check
      CHECK (status IN ('pending', 'approved', 'paid', 'cancelled'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_buyer_user_id_fkey'
  ) THEN
    ALTER TABLE public.deals ADD CONSTRAINT deals_buyer_user_id_fkey
      FOREIGN KEY (buyer_user_id) REFERENCES public.users(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_seller_user_id_fkey'
  ) THEN
    ALTER TABLE public.deals ADD CONSTRAINT deals_seller_user_id_fkey
      FOREIGN KEY (seller_user_id) REFERENCES public.users(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_buyer_request_id_fkey'
  ) THEN
    ALTER TABLE public.deals ADD CONSTRAINT deals_buyer_request_id_fkey
      FOREIGN KEY (buyer_request_id) REFERENCES public.buyer_requests(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_seller_listing_id_fkey'
  ) THEN
    ALTER TABLE public.deals ADD CONSTRAINT deals_seller_listing_id_fkey
      FOREIGN KEY (seller_listing_id) REFERENCES public.seller_listings(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_product_id_fkey'
  ) THEN
    ALTER TABLE public.deals ADD CONSTRAINT deals_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_deal_id_fkey'
  ) THEN
    ALTER TABLE public.documents ADD CONSTRAINT documents_deal_id_fkey
      FOREIGN KEY (deal_id) REFERENCES public.deals(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_uploaded_by_fkey'
  ) THEN
    ALTER TABLE public.documents ADD CONSTRAINT documents_uploaded_by_fkey
      FOREIGN KEY (uploaded_by) REFERENCES public.users(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commissions_beneficiary_user_id_fkey'
  ) THEN
    ALTER TABLE public.commissions ADD CONSTRAINT commissions_beneficiary_user_id_fkey
      FOREIGN KEY (beneficiary_user_id) REFERENCES public.users(id);
  END IF;
END
$$;

COMMIT;
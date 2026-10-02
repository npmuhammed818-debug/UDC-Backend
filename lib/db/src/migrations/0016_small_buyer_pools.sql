CREATE TABLE IF NOT EXISTS "buyer_pools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'forming' NOT NULL,
  "target_quantity" numeric(20,6) NOT NULL,
  "unit" text NOT NULL,
  "instrument_structure" text DEFAULT 'bank_review_required' NOT NULL,
  "bank_approval_status" text DEFAULT 'not_reviewed' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "buyer_pools_deal_unique" ON "buyer_pools" ("deal_id");
CREATE INDEX IF NOT EXISTS "buyer_pools_status_idx" ON "buyer_pools" ("status");

CREATE TABLE IF NOT EXISTS "buyer_pool_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pool_id" uuid NOT NULL REFERENCES "buyer_pools"("id") ON DELETE CASCADE,
  "buyer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "quantity" numeric(20,6) NOT NULL,
  "committed_value" numeric(18,2),
  "currency" text DEFAULT 'USD' NOT NULL,
  "status" text DEFAULT 'invited' NOT NULL,
  "instrument_reference" text,
  "instrument_status" text DEFAULT 'not_started' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "buyer_pool_allocations_pool_buyer_unique" ON "buyer_pool_allocations" ("pool_id", "buyer_user_id");
CREATE INDEX IF NOT EXISTS "buyer_pool_allocations_buyer_idx" ON "buyer_pool_allocations" ("buyer_user_id");
CREATE INDEX IF NOT EXISTS "buyer_pool_allocations_status_idx" ON "buyer_pool_allocations" ("status");

ALTER TABLE "buyer_pools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "buyer_pool_allocations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "buyer_pools" FROM anon, authenticated;
REVOKE ALL ON TABLE "buyer_pool_allocations" FROM anon, authenticated;

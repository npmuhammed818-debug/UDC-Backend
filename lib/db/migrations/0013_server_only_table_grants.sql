BEGIN;

-- UDC currently accesses PostgreSQL through the trusted backend connection.
-- PostgREST client roles are intentionally not used for direct table access.
-- Keep RLS as defense in depth and remove broad base privileges so a future
-- policy cannot accidentally expose private trade data.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agents','akif_collection_queue','akif_collection_runs','akif_companies',
    'akif_data_records','akif_data_sources','akif_identity','akif_learning_events',
    'akif_market_signals','akif_product_aliases','akif_product_observations',
    'akif_products','akif_research_runs','audit_logs','auth_sessions',
    'buyer_requests','buyers','commissions','companies',
    'company_verification_documents','deal_conversation_events','deal_financials',
    'deal_intelligence_snapshots','deal_participants','deals','document_access',
    'document_extractions','documents','inquiries','inspections','matches',
    'messages','notifications','offers','products','referrals','seller_listings',
    'sellers','shipments','users','whatsapp_intake_drafts',
    'whatsapp_message_contexts','whatsapp_user_contexts','whatsapp_webhook_inbox'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    END IF;
  END LOOP;
END
$$;

COMMIT;

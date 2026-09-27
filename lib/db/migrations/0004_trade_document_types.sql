-- Trade documents uploaded through WhatsApp use their actual document type.
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_document_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IN (
    'company_registration', 'business_license', 'certificate', 'invoice',
    'packing_list', 'bill_of_lading', 'inspection_report',
    'certificate_of_origin', 'other', 'LOI', 'ICPO', 'FCO', 'SCO', 'SPA',
    'NCNDA', 'SGS', 'BL', 'CO', 'COA', 'trade_document'
  ));

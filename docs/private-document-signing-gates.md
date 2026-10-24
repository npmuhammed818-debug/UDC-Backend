# Security review: UDC private trade document signing

**Draft QA only. No merge, production deployment, real document access, customer contact or database changes.**

Document permissions are enforced in **two layers**. A valid signed URL is a bearer credential, so a stale grant or incorrect stored file reference must never cause a private file belonging to a different deal or company to be signed.

## Ownership-bound URLs

All authorized browser routes and WhatsApp forwarding now sign only **managed private storage references** under one of these patterns:

- Deal trade documents: `storage://udc-documents/deals/{current-deal-id}/{filename or approved subfolder/filename}`.
- Company identity evidence: `storage://udc-documents/companies/{current-company-id}/{filename}`.

No arbitrary `https://` URL, root-level object, wrong company or deal ID, `..` traversal, encoded separators, query strings or malformed path is signed. Unrecognized legacy references return a **null file URL** for review. They are not exposed to traders as an unverified external direct-download link. Historical rows are not altered or deleted.

The existing route-level checks remain necessary: authenticated verified user where required, current deal membership, an explicit document access grant, and appropriate document review status; active assigned agents lose access on revocation. The WhatsApp forwarding route additionally checks recipient approval and verifies that forwarding has a distinct human-reviewed recipient grant. Admins may review document metadata but cannot use a mismatched object reference to mint a valid signed document URL.

The admin document registration endpoint no longer accepts external HTTPS URLs or an arbitrary `storage://udc-documents/` reference: it validates the stored path belongs to the selected deal. It does **not** blindly repair or reinterpret existing rows.

## Still required before live data

- Verify Supabase `udc-documents` stays private and signs for **300 seconds** only.
- Test company ID/bank-proof boundaries, rejected/pending/revoked grants, deal member changes, seller multi-product attachment, and role switching on staging data.
- Inventory any legacy HTTPS/unscoped document URLs and manually reconcile them with permission from the document owner; never move or reshare documents automatically.
- Confirm that no client/API endpoint exposes `SUPABASE_SERVICE_ROLE_KEY`; do not treat a browser-accessible signed URL as permanent authorization.
- Confirm any URL already issued before revocation remains usable until expiration; avoid claims of instant cryptographic revocation.

Tests use an isolated Express database fixture and pure storage-path tests, without contacting Supabase or actual customers.

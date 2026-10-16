# AKIF ImpexQ sandbox integration

AKIF exposes all four documented ImpexQ sandbox tools through existing admin-only routes. Sandbox tools are intentionally excluded from customer WhatsApp answers and automatic deal updates because HSN, RoDTEP and calculator results contain simulated data. FTA returns provider reference data when `_mock` is explicitly false; this is not customs eligibility approval.

Source: https://impexq.com/api-sandbox (API reference checked 16 October 2026).

## Configuration

Set `IMPEXQ_API_KEY` in the backend's secret environment. Never put it in frontend code, chat messages, source control or screenshots. The default upstream is `https://impexq.com/api/sandbox`. `IMPEXQ_SANDBOX_BASE_URL` is an optional server-side override for integration testing.

ImpexQ's reference currently documents verified email activation, a 7-day key lifetime, 500 lifetime calls, 100 calls/day and 10 requests/minute. Permission to use the sandbox does not itself issue or activate a key. Check the response quota/expiry metadata; production access and buyer-data licensing are separate arrangements.

## Admin API

These routes use the existing authenticated admin session and the `/api` prefix. All POST bodies retain the existing `{ "payload": {...} }` envelope.

| Route | Payload |
| --- | --- |
| `GET /api/admin/akif/impexq/status` | None; configuration and supported destinations |
| `POST /api/admin/akif/impexq/hsn` | `{ "query": "basmati rice" }` |
| `POST /api/admin/akif/impexq/rodtep` | `{ "query": "cotton t-shirts" }` |
| `POST /api/admin/akif/impexq/fta` | `{ "destination": "uae", "query": "basmati rice" }` |
| `POST /api/admin/akif/impexq/calculator` | `{ "query": "basmati rice", "cifValue": 5000, "destination": "uae" }` |

FTA query is optional. Calculator destination is optional, but AKIF requires an explicit positive finite CIF value **in INR per unit** rather than letting ImpexQ silently default it to 1000. These tools cover India-related classification, incentives and trade agreements; they are not a universal worldwide tariff API. Country keys come from the status endpoint.

Responses preserve upstream data, quota/expiry metadata, source URL and retrieval time. The wrapper labels mock data, sets `productionReady: false`, and includes calculator currency and value basis. It rejects non-JSON/non-sandbox upstream responses. Secrets and upstream error bodies are not returned to callers. Invalid request fields return 400, missing configuration 503, and upstream failures 502. The main AKIF capabilities endpoint also reports ImpexQ configuration.

## Verification

`pnpm release:verify` runs workspace type checking, backend tests and the API build. The ImpexQ tests mock HTTP and verify all four request contracts, validation, missing credentials, provider failures, malformed responses and sandbox provenance. They do not establish that a real key is active. A live authenticated request is still required after configuring an issued key.

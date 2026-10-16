# AKIF free API integrations

AKIF reuses the existing Comtrade preview worker and GLEIF company-identity worker.
New public-data calls run in the existing TypeScript API; no new service is required.

| Source | Entry point (under `/api`) | Authentication/configuration |
| --- | --- | --- |
| UN Comtrade | POST `/admin/akif/intelligence/trade/comtrade/preview` | Existing worker URL/token; public preview, up to 500 records |
| GLEIF | POST `/admin/akif/company/gleif/search` | Existing worker URL/token; provider needs no key |
| Frankfurter | POST `/admin/akif/economics/fx` | UDC admin session; no provider key |
| GDELT | POST `/admin/akif/news/search` | UDC admin session; no provider key |
| World Bank | POST `/admin/akif/market/indicators` | UDC admin session; no provider key |
| Eurostat | POST `/admin/akif/market/eurostat/trade` | UDC admin session; no provider key |
| Trade.gov CSL | POST `/admin/akif/compliance/csl/screen` | UDC admin session; free `TRADE_GOV_API_KEY` in API server environment |

Example bodies:

```json
{"base":"USD","quote":"INR","amount":590000}
```
```json
{"query":"copper port disruption","limit":10}
```
```json
{"country":"ARE","indicator":"NE.IMP.GNFS.CD"}
```

Supported indicators: GDP (`NY.GDP.MKTP.CD`), inflation (`FP.CPI.TOTL.ZG`),
imports (`NE.IMP.GNFS.CD`) and exports (`NE.EXP.GNFS.CD`). The API retains
observation dates and missing/null values. Values have indicator-specific units.

Completed market research now includes `publicMarketContext`: GDELT headlines
and World Bank import indicators for supported countries, with source URLs and
retrieval timestamps persisted alongside existing Comtrade evidence. Either new
provider can fail without failing the main Comtrade research. Product/country
search terms go to GDELT; private documents and contacts are not sent.
FX is an explicit calculation endpoint and never changes stored contract prices.
Public-data calls have eight-second timeouts and bounded caches (FX one hour,
news fifteen minutes, macro data one day), retaining original retrieval times.
News content is untrusted and must never be treated as model instructions.
These feeds do not independently verify companies, sanctions or trade claims.

## Optional free-tier AI providers

The existing worker LiteLLM gateway supports Groq and Gemini. LiteLLM is installed
by the standard worker build (`pip install .`); the optional `agents` extra adds
LangGraph orchestration. Configure ONE model explicitly:

```sh
# Groq: select a currently available model within your account's free limits.
AKIF_LLM_MODEL=groq/YOUR_MODEL_ID
GROQ_API_KEY=YOUR_KEY
```

```sh
# Gemini: select a model eligible for free API access in your account.
AKIF_LLM_MODEL=gemini/YOUR_MODEL_ID
GEMINI_API_KEY=YOUR_KEY
AKIF_GEMINI_DATA_PROCESSING_ACCEPTED=true
```

Set keys through the worker host's secret environment settings, never source code
or frontend. No accounts, keys or paid plans are created by this change. A key
alone does not ensure free use: retain free account quotas and do not enable paid
billing. Missing credentials are reported as unconfigured. There is no automatic
fallback between these providers. Calls have no retries, a twenty-second timeout
and a 2,048-token output cap.

Gemini free-tier content may be used for product improvement. The explicit flag
acknowledges this processing; initially use public/dummy data only. This gate does
not replace the operator's responsibility to select a suitable production data
policy. Existing UDC model routing and WhatsApp behavior remain unchanged; these
providers are available through the worker's existing reasoning/product tools.

## Activation and verification

Deploy the updated API and worker to activate code in production. Test admin
endpoints with a valid session; public-data availability depends on upstream
services. Obtain Groq/Gemini keys separately to test live model inference. The
Comtrade free registered key is optional for future larger-volume access; this
change deliberately reuses the already implemented keyless preview.

## Validation for this change

- Workspace TypeScript checks passed.
- API test suite after combined review fixes: 82 passed.
- Worker Python test suite: 6 passed.
- Full API build, including frontend build, passed.
- Live Frankfurter USD/INR lookup succeeded from the development environment.
- Live World Bank ARE import-indicator lookup passed (five observations).
- Live GDELT probe exceeded the eight-second timeout here; its connectivity
  remains unverified. Mocked tests cover response parsing and failure isolation.
- Groq/Gemini calls were not sent; no provider keys were configured here.

## Review notes

The worker gateway currently accepts text messages. It can reason over extracted
document text; direct image/PDF uploads to Gemini are not wired to this gateway.
Selecting a worker model does not change the separate WhatsApp conversation
provider chain. Admin reasoning/product tools use the worker gateway.

Backend model-call deadlines allow 25 seconds for a single 20-second model call
and 70 seconds for three sequential specialist calls. GDELT error objects are
rejected rather than silently treated as successful empty searches.

## Eurostat trade and Trade.gov CSL

Eurostat request example:

```json
{"geo":"DE","year":2024,"flow":"imports","productGroup":"SITC0_1","partner":"WORLD"}
```

The fixed `ext_lt_intertrd` dataset uses annual broad SITC groups. Import/export/balance
values are in **million ECU/EUR**, not currency per tonne. JSON-stat dimensions,
observation statuses and missing values are preserved. The code does not convert
SITC to HS codes or claim product-level buyer discovery. Responses are cached for
one day. The live Eurostat dataset and dimension names were checked against its
public API on 16 October 2026.

CSL request example:

```json
{"name":"Example Trading","limit":20}
```

Set `TRADE_GOV_API_KEY` through the **UDC API server** secret environment, not the
Python worker. Register and subscribe at https://developer.trade.gov/ to obtain a
free subscription key. Status: GET `/api/admin/akif/compliance/csl/status`.
Missing configuration returns 503. The key goes only in the `subscription-key`
header; it is never returned in status, provenance or error bodies. Screening
queries are not cached. Source: https://www.trade.gov/consolidated-screening-list.

CSL covers US consolidated export restriction lists, not every jurisdiction.
Candidate identities, original restrictions, ownership and applicability require
human review. Both matches and no-match results set `humanReviewRequired: true`
and `approvedToTrade: false`. Truncated results are explicitly marked. These are
admin research endpoints; they never approve a party or change a deal's state.

The ImpexQ sandbox is separate and remains inactive until its own key is supplied.
None of the connectors guarantees an external service will remain free forever;
respect provider terms, fair-use limits and attribution.

Live smoke checks on 16 October 2026: Frankfurter, World Bank and Eurostat returned
valid responses through the integrated clients. GDELT timed out within the bounded
request timeout; research reports it as unavailable. CSL live authentication is
unverified because no key was available in the test environment. Worker provider
settings were not changed; existing Groq selection is preserved.

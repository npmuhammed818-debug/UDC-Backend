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

The existing worker LiteLLM gateway supports Groq and Gemini. Install the existing
worker `agents` extra (`pip install '.[agents]'`). Configure ONE model explicitly:

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
- API test suite: 73 passed.
- Worker Python test suite: 6 passed.
- Full API build, including frontend build, passed.
- Live Frankfurter USD/INR lookup succeeded from the development environment.
- Live GDELT and World Bank probes exceeded the eight-second timeout here;
  upstream connectivity remains unverified. Mocked tests cover their response
  parsing and failure isolation.
- Groq/Gemini calls were not sent; no provider keys were configured here.

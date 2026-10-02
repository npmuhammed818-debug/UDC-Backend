# Optional AKIF decision models

The intake conversation can ask Laya or Jev for a bounded intent hint. The existing conversation model still extracts facts and writes replies. The hint cannot submit an offer, relay a message, verify a party, or approve a deal. When neither provider is configured or available, intake continues normally.

Set `AKIF_LAYA_URL` to the internal base URL of a Laya HTTP server with `/predict` (the upstream `examples/server.py`, installed with `laya[serve]`). Set `AKIF_LAYA_TOKEN` only if that server is protected by a bearer-token proxy. Laya is tried first. For Jev fallback, set `TYPESAFE_API_KEY` in the API server's secret environment. Jev uses TypeSafe's `/v1/systemone` endpoint and may incur usage charges. Never put keys in client code.

Do not expose the Laya server publicly without access controls. This integration sends incoming WhatsApp message text to the configured model provider, so review data handling before enabling Jev for real users. Both providers are optional and disabled until configured.

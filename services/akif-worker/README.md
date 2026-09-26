# UDC AKIF Intelligence Worker

This service isolates Python-native open-source intelligence libraries from the existing UDC TypeScript API.

## Included capabilities

- **Docling**: local parsing of uploaded trade documents into structured Markdown.
- **Splink 4.0.17**: probabilistic entity resolution for larger company datasets.
- **RapidFuzz**: deterministic fallback for small or unstable entity-resolution batches.
- **LangGraph**: optional durable orchestration layer for future multi-step AKIF research workflows.
- **LiteLLM**: optional provider-neutral LLM gateway. Set `AKIF_LLM_MODEL` when a model is intentionally configured.

## Safety and product rules

Entity matches are candidate links, not verification decisions. Parsed document text is not proof that a document is authentic. Banking, legal, compliance, verification and transaction approvals remain under authorized human control.

## Run locally

Use Python 3.11+.

```bash
pip install -e ".[agents,dev]"
uvicorn app.main:app --reload --port 8080
```

The Node API connects to this worker through `AKIF_WORKER_URL`. Keep the worker on a private/internal network in production.

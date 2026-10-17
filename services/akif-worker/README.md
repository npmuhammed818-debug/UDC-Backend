# UDC AKIF Intelligence Worker

This service isolates Python-native open-source intelligence libraries from the existing UDC TypeScript API.

## Included capabilities

- **Docling**: local parsing of uploaded trade documents into structured Markdown.
- **Splink 4.0.17**: probabilistic entity resolution for larger company datasets.
- **RapidFuzz**: deterministic fallback for small or unstable entity-resolution batches.
- **LangGraph**: optional durable orchestration layer for future multi-step AKIF research workflows.
- **LiteLLM**: installed provider-neutral LLM gateway. Set `AKIF_LLM_MODEL` when a model is intentionally configured.

## Safety and product rules

Entity matches are candidate links, not verification decisions. Parsed document text is not proof that a document is authentic. Banking, legal, compliance, verification and transaction approvals remain under authorized human control.

## Run locally

Use Python 3.12.11 for the Render deployment. Set `PYTHON_VERSION=3.12.11`
and `LITELLM_LOCAL_MODEL_COST_MAP=True` in Render to use the packaged model map
and avoid a remote model-map fetch during cold startup.

```bash
pip install -e ".[agents,dev]"
uvicorn app.main:app --reload --port 8080
```

The Node API connects through `AKIF_WORKER_URL` and authenticates with `AKIF_WORKER_TOKEN`. Configure the same strong random token on both services and keep the worker on a private/internal network in production.

## Conversation and media activation

On the API service, enable `AKIF_WORKER_CONVERSATION_ENABLED=true` and
`AKIF_WORKER_MEDIA_ENABLED=true`. Both use the existing worker URL and shared
internal token. Configure `AKIF_LLM_MODEL` and its provider key on this worker.
Groq supplies chat and voice transcription; the separately configured Gemini
model supplies image transcription when its processing gate is accepted.

`AKIF_STARTUP_MODEL_PROBE=true` and `AKIF_STARTUP_GEMINI_PROBE=true` run fixed
public-prompt checks and log only safe status/model/error-class fields. Health
status alone does not establish provider authentication or real message delivery.
See `docs/mvp-launch-readiness.md` for the full scope and acceptance gates.

# AKIF Self-Hosted Brain

This is UDC's optional self-hosted conversation brain. It uses an OpenAI-compatible model endpoint so UDC can run without depending on OpenAI or Hermes for normal WhatsApp conversation.

## Local runtime

The default development model is `qwen3:8b` through Ollama.

Start Ollama:

```bash
docker compose -f docker-compose.akif-brain.yml up -d
docker compose -f docker-compose.akif-brain.yml exec akif-brain ollama pull qwen3:8b
```

Point the UDC API at it:

```bash
AKIF_BRAIN_URL=http://127.0.0.1:11434/v1
AKIF_BRAIN_MODEL=qwen3:8b
```

`AKIF_BRAIN_API_KEY` is optional for local Ollama. In production, put the model server behind a private authenticated network or gateway and set that key.

## Provider order

For WhatsApp conversation UDC uses:

1. self-hosted AKIF brain when `AKIF_BRAIN_URL` is configured
2. OpenAI when configured
3. Hermes as the final fallback

Supabase/deal context remains the memory and source of truth. Payment, verification, compliance, document, banking and transaction authority remain enforced by UDC code and human review rather than delegated to the language model.

## Production

The same integration can point at any OpenAI-compatible inference server, including vLLM. Set `AKIF_BRAIN_URL` to the server's `/v1` base URL and `AKIF_BRAIN_MODEL` to the served model name.

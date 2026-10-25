# AKIF model failover and voice provider (draft, nothing deployed)

## Chat models (services/akif-worker/app/llm_gateway.py)
- `AKIF_LLM_MODEL` = primary (e.g. a `gemini/...` Flash model). `AKIF_LLM_BACKUP_MODEL` = backup (e.g. `groq/...`). Keys: `GEMINI_API_KEY`, `GROQ_API_KEY`. Only these two models are ever called.
- On error, timeout or 429 the primary is tried twice (short pause), then the backup twice. One shared deadline (max 20 s), so failover never extends the wait.
- Data gate: `AKIF_GEMINI_DATA_PROCESSING_ACCEPTED=true` is required before **private** content (deal, account or user data) goes to Gemini. With it off, private content goes only to the backup; if the backup is down the request fails. It never falls through to Gemini. Generic content (`sensitivity="generic"`: learning topics, product classification, startup probe) may use Gemini without the opt-in.
- `/chat/completions` accepts `sensitivity` ("private" default, "generic"). The API does not set "generic" yet, so all conversation chat is treated as private.
- `/health` llm_gateway status now reports `automatic_provider_fallback`, `backup_model` and provider counts for private and generic content.

## Voice (services/akif-worker/app/speech.py)
- `AKIF_VOICE_REPLIES=on` is still required (default off). `AKIF_TTS_PROVIDER` = `elevenlabs` (default) or `gemini`. No automatic switch between them.
- ElevenLabs: `ELEVENLABS_API_KEY` (missing = disabled), `ELEVENLABS_VOICE_ID` (required), `ELEVENLABS_MODEL_ID` (default `eleven_flash_v2_5`; allowed: `eleven_flash_v2_5`, `eleven_multilingual_v2`, `eleven_flash_v2`). Requests `mp3_44100_64`, converted to OGG/Opus with ffmpeg for WhatsApp.
- The exact-text allowlist (speakable_replies.json) is checked before any provider is chosen; no free text, deal or user data is ever sent. Daily cap `AKIF_TTS_DAILY_CAP` (default 50) still applies.
- Not tested against the real ElevenLabs API (no key); tests use fake HTTP. Voice and plan choice are the owner's; the key is added on the host, never in the repo.

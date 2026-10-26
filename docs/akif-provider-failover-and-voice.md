# AKIF model failover and voice provider (draft, nothing deployed)

## Chat models (services/akif-worker/app/llm_gateway.py)
- `AKIF_LLM_MODEL` = primary (e.g. a `gemini/...` Flash model). `AKIF_LLM_BACKUP_MODEL` = backup (e.g. `groq/...`). Keys: `GEMINI_API_KEY`, `GROQ_API_KEY`. Only these two models are ever called.
- On error, timeout or 429 the primary is tried twice (short pause), then the backup twice. One shared deadline (max 20 s), so failover never extends the wait.
- Data gate: `AKIF_GEMINI_DATA_PROCESSING_ACCEPTED=true` is required before **private** content (deal, account or user data) goes to Gemini. With it off, private content goes only to the backup; if the backup is down the request fails. It never falls through to Gemini. Generic content (`sensitivity="generic"`: learning topics, product classification, startup probe) may use Gemini without the opt-in.
- `/chat/completions` accepts `sensitivity` ("private" default, "generic"). The API now sends it explicitly: all conversation chat is "private"; only a caller that guarantees no deal, account or user data may pass "generic".
- `/health` llm_gateway status now reports `automatic_provider_fallback`, `backup_model` and provider counts for private and generic content.

## Voice (services/akif-worker/app/speech.py)
- `AKIF_VOICE_REPLIES=on` is still required (default off). `AKIF_TTS_PROVIDER` = `elevenlabs` (default) or `gemini`. No automatic switch between them.
- ElevenLabs: `ELEVENLABS_API_KEY` (missing = disabled), `ELEVENLABS_VOICE_ID` (required), `ELEVENLABS_MODEL_ID` (default `eleven_flash_v2_5`; allowed: `eleven_flash_v2_5`, `eleven_multilingual_v2`, `eleven_flash_v2`). Requests `mp3_44100_64`, converted to OGG/Opus with ffmpeg for WhatsApp.
- The exact-text allowlist (speakable_replies.json) is checked before any provider is chosen; no free text, deal or user data is ever sent. Daily cap `AKIF_TTS_DAILY_CAP` (default 50) still applies.
- Not tested against the real ElevenLabs API (no key); tests use fake HTTP. Voice and plan choice are the owner's; the key is added on the host, never in the repo.

## Conversational voice with ElevenLabs (owner-approved 26 Oct, supersedes the fixed-sentence-only rule for replies)
Flow: WhatsApp voice note -> download -> worker STT (ElevenLabs Scribe, model `ELEVENLABS_STT_MODEL_ID` default scribe_v1; falls back to Groq Whisper if ElevenLabs fails; `AKIF_STT_PROVIDER=groq` forces Groq) -> existing AKIF guidance engine on Groq -> reply spoken by ElevenLabs TTS if allowed, else text. Text in -> text out, unchanged.
- Kill switches: `AKIF_VOICE_REPLIES` (master, default off), `AKIF_VOICE_CONVERSATIONAL=off` (back to fixed sentences only).
- Spoken only if the reply is at most 600 chars and has no links, emails, 7+ digit numbers, codes/OTP/password words, bank or ID words (IBAN, IFSC, Aadhaar, passport), vault/upload-link words, or approval prompts. The same rules run in the API and again in the worker. Anything else is sent as text.
- Caps: per user per day `AKIF_VOICE_STT_PER_USER_DAILY` (30), `AKIF_VOICE_TTS_PER_USER_DAILY` (20), `AKIF_VOICE_TTS_CHARS_PER_USER_DAILY` (6000); worker global `AKIF_TTS_DAILY_CAP` (50 calls) and `AKIF_TTS_DAILY_CHARS` (20000). Per-user counters are in memory and reset on restart.
- Only the final reply text goes to ElevenLabs TTS; only the audio goes to STT. The transcript is not sent to ElevenLabs TTS. Audio, transcripts, reply text and keys are never logged.
- Deal actions by voice (negotiation relay, approvals, intake) stay confirm-in-text: a voice transcript is recorded as unconfirmed and AKIF asks for text confirmation.
- Env needed on Render staging (not set by me): ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, AKIF_VOICE_REPLIES=on, AKIF_WORKER_MEDIA_ENABLED=true. Gemini stays off.

### Voice notice and "text only" (migration lib/db/migrations/20261026_whatsapp_voice_preferences.sql, NOT applied anywhere)
- Table whatsapp_voice_preferences (SHA-256 of phone, notice_sent_at, text_only). Rollback draft: docs/drafts/whatsapp-voice-preferences-rollback.sql.draft.
- First time a voice reply would be spoken, the user gets the text reply plus a short notice (wording needs owner approval); voice starts from the next voice note. "text only" stops voice; "voice on" restores it. Exact phrases only, so normal sentences are never read as commands.
- Fails closed: if the table is missing or errors, replies are text only and nothing is spoken.

"""Draft text-to-speech for AKIF voice-note replies. Off unless AKIF_VOICE_REPLIES=on.

Provider-agnostic: AKIF_TTS_PROVIDER selects "elevenlabs" (default, needs ELEVENLABS_API_KEY;
a missing key means voice is disabled) or "gemini" (free tier, explicit data opt-in). Whichever
provider runs, only the exact fixed sentences in speakable_replies.json are ever sent to it, so
no user, deal or account text can reach a speech provider. No automatic switch between providers.
"""
import base64
import json
import os
import subprocess
import time
import urllib.request

from fastapi import HTTPException

ALLOWED_MODELS = {"gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"}
_calls: list[float] = []


def _load_allowlist() -> frozenset[str]:
    path = os.path.join(os.path.dirname(__file__), "speakable_replies.json")
    with open(path, encoding="utf-8") as handle:
        return frozenset(json.load(handle))


ALLOWED_TEXTS = _load_allowlist()


def speech_text_allowed(text: str) -> bool:
    """Default-deny: only the exact fixed sentences in speakable_replies.json may be spoken.

    The API keeps the same list (artifacts/api-server src/akif/voiceReply.ts) and a test
    asserts both are identical. Free-form or user-derived text is never sent to the provider.
    """
    return isinstance(text, str) and text in ALLOWED_TEXTS


ELEVENLABS_MODELS = {"eleven_flash_v2_5", "eleven_multilingual_v2", "eleven_flash_v2"}
_ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/"


def _provider() -> str:
    return os.getenv("AKIF_TTS_PROVIDER", "elevenlabs").strip().lower() or "elevenlabs"


def _config() -> tuple[str, str, str]:
    """Gemini settings (key, model, voice). Voice replies must be switched on first."""
    if os.getenv("AKIF_VOICE_REPLIES") != "on":
        raise HTTPException(status_code=503, detail="voice_replies_disabled")
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="gemini_not_configured")
    if os.getenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED") != "true":
        raise HTTPException(status_code=503, detail="gemini_processing_not_enabled")
    model = os.getenv("AKIF_TTS_MODEL", "gemini-3.8-flash-lite-tts").strip()
    if model not in ALLOWED_MODELS:
        raise HTTPException(status_code=503, detail="tts_model_not_allowed")
    return key, model, os.getenv("AKIF_TTS_VOICE", "Kore").strip() or "Kore"


def _elevenlabs_config() -> tuple[str, str, str]:
    if os.getenv("AKIF_VOICE_REPLIES") != "on":
        raise HTTPException(status_code=503, detail="voice_replies_disabled")
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="elevenlabs_not_configured")
    voice = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
    if not voice or not voice.isalnum():
        raise HTTPException(status_code=503, detail="elevenlabs_voice_not_set")
    model = os.getenv("ELEVENLABS_MODEL_ID", "eleven_flash_v2_5").strip()
    if model not in ELEVENLABS_MODELS:
        raise HTTPException(status_code=503, detail="tts_model_not_allowed")
    return key, model, voice


def _daily_cap_ok() -> bool:
    cap = int(os.getenv("AKIF_TTS_DAILY_CAP", "50") or "50")
    now = time.time()
    _calls[:] = [t for t in _calls if now - t < 86_400]
    if len(_calls) >= cap:
        return False
    _calls.append(now)
    return True


def speech_status() -> dict:
    provider = _provider()
    base = {"provider": provider, "automatic_provider_fallback": False}
    try:
        if provider == "elevenlabs":
            _, model, _voice = _elevenlabs_config()
            return {**base, "configured": True, "model": model}
        if provider == "gemini":
            _, model, voice = _config()
            return {**base, "configured": True, "model": model, "voice": voice}
        return {**base, "configured": False, "reason": "tts_provider_unknown"}
    except HTTPException as exc:
        return {**base, "configured": False, "reason": exc.detail}


def wav_to_ogg_opus(wav: bytes) -> bytes:
    try:
        done = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"],
            input=wav, capture_output=True, timeout=20, check=True)
    except (FileNotFoundError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=503, detail="audio_conversion_unavailable") from exc
    return done.stdout


def _synthesize_elevenlabs(text: str) -> bytes:
    key, model, voice = _elevenlabs_config()
    if not _daily_cap_ok():
        raise HTTPException(status_code=429, detail="tts_daily_cap_reached")
    req = urllib.request.Request(
        f"{_ELEVENLABS_URL}{voice}?output_format=mp3_44100_64",
        data=json.dumps({"text": text.strip(), "model_id": model}).encode(), method="POST",
        headers={"xi-api-key": key, "content-type": "application/json", "accept": "audio/mpeg"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:  # no retries, no other provider
            audio = resp.read()
        if not audio:
            raise ValueError("no_audio")
    except Exception as exc:
        raise HTTPException(status_code=502, detail="speech_synthesis_failed") from exc
    return wav_to_ogg_opus(audio)  # ffmpeg detects the input format (mp3 here)


def synthesize(text: str) -> bytes:
    # The exact-text allowlist runs first, before any provider is chosen or contacted.
    if not speech_text_allowed(text):
        raise HTTPException(status_code=422, detail="text_not_allowed_for_speech")
    provider = _provider()
    if provider == "elevenlabs":
        return _synthesize_elevenlabs(text)
    if provider != "gemini":
        raise HTTPException(status_code=503, detail="tts_provider_unknown")
    return _synthesize_gemini(text)


def _synthesize_gemini(text: str) -> bytes:
    key, model, voice = _config()
    if not _daily_cap_ok():
        raise HTTPException(status_code=429, detail="tts_daily_cap_reached")
    body = {
        "model": model,
        "input": [{"type": "user_input", "content": [{"type": "text", "text": text.strip()}]}],
        "response_format": {"type": "audio"},
        "generation_config": {"speech_config": [{"voice": voice}]},
    }
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        data=json.dumps(body).encode(), method="POST",
        headers={"x-goog-api-key": key, "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:  # no retries
            payload = json.loads(resp.read())
        audio = None
        for step in payload.get("steps", []):
            if step.get("type") == "model_output":
                for part in step.get("content", []):
                    if part.get("type") == "audio":
                        audio = part.get("data")
        if not audio:
            raise ValueError("no_audio")
        wav = base64.b64decode(audio)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="speech_synthesis_failed") from exc
    return wav_to_ogg_opus(wav)

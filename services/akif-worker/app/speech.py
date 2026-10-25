"""Draft text-to-speech for AKIF voice-note replies. Off unless AKIF_VOICE_REPLIES=on.

Free-tier Gemini content may be used by Google to improve products and read by human
reviewers, so only short, generic, non-personal text is ever spoken. One model, no fallback
to any other provider (no paid provider is ever called).
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


def _config() -> tuple[str, str, str]:
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


def _daily_cap_ok() -> bool:
    cap = int(os.getenv("AKIF_TTS_DAILY_CAP", "50") or "50")
    now = time.time()
    _calls[:] = [t for t in _calls if now - t < 86_400]
    if len(_calls) >= cap:
        return False
    _calls.append(now)
    return True


def speech_status() -> dict:
    try:
        _, model, voice = _config()
        return {"configured": True, "model": model, "voice": voice, "automatic_provider_fallback": False}
    except HTTPException as exc:
        return {"configured": False, "reason": exc.detail, "automatic_provider_fallback": False}


def wav_to_ogg_opus(wav: bytes) -> bytes:
    try:
        done = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"],
            input=wav, capture_output=True, timeout=20, check=True)
    except (FileNotFoundError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=503, detail="audio_conversion_unavailable") from exc
    return done.stdout


def synthesize(text: str) -> bytes:
    if not speech_text_allowed(text):
        raise HTTPException(status_code=422, detail="text_not_allowed_for_speech")
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

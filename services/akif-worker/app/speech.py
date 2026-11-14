"""Draft text-to-speech for AKIF voice-note replies. Off unless AKIF_VOICE_REPLIES=on.

Conversational replies (synthesize(..., conversational=True)) are allowed when they pass the privacy rules
in conversational_text_ok (no links, emails, long numbers, codes, bank or ID words, approval prompts, max 600
chars); AKIF_VOICE_CONVERSATIONAL=off returns to fixed sentences only. Daily caps: calls and characters.

Provider: AKIF_TTS_PROVIDER selects "gemini" (free tier, explicit data opt-in) and gemini is the
default and only provider (owner direction, 14 Nov: voice is 100% free - ElevenLabs is out of the
chain entirely; nothing may call it). Only the exact fixed sentences in speakable_replies.json, or
privacy-filtered conversational text, plus a fixed style instruction, are ever sent to the provider,
so no user, deal or account text can reach a speech provider. When Gemini's free quota or the
provider itself fails, the caller gets an error and answers in text instead.
"""
import base64
import json
import logging
import os
import re
import subprocess
import time
import urllib.error
import urllib.request

logger = logging.getLogger("akif.speech")

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


# Master Plan v3 language rule: text is always English; voice is the customer's language or
# English. Only these languages may be requested; anything else fails closed.
VOICE_LANGUAGES = {"english", "malayalam", "hindi", "tamil", "arabic"}


def _provider() -> str:
    return os.getenv("AKIF_TTS_PROVIDER", "gemini").strip().lower() or "gemini"


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


MAX_CONVERSATIONAL_CHARS = 600
_BLOCKED = [re.compile(p, re.I) for p in (
    r"https?://|www\.|\b[a-z0-9-]+\.(?:com|net|org|in|io|site|app|co)\b/?",
    r"[^\s@]+@[^\s@]+\.[^\s@]+",
    r"\b(?:otp|one[- ]time|passcode|password|passphrase|cvv|pin)\b",
    r"\b(?:iban|swift|ifsc|bank account|account number|routing number|card number|aadhaar|aadhar|passport)\b",
    r"\b(?:vault|sign[- ]?in code|verification code|upload link)\b",
    r"\b(?:reply|type|send|say)\s+(?:yes|confirm|approve|accept)\b",
    r"\b(?:please confirm|needs? your approval|approve (?:this|the)|awaiting your approval)\b",
)]
_chars: list[tuple[float, int]] = []


def conversational_text_ok(text: str) -> bool:
    """Second copy of the API privacy rules (voiceReply.ts); a test keeps them identical."""
    if not isinstance(text, str):
        return False
    trimmed = text.strip()
    if not trimmed or len(trimmed) > MAX_CONVERSATIONAL_CHARS:
        return False
    if re.search(r"\d{7,}", re.sub(r"[\s().-]", "", trimmed)):
        return False
    return not any(p.search(trimmed) for p in _BLOCKED)


def _daily_cap_ok(chars: int = 0) -> bool:
    cap = int(os.getenv("AKIF_TTS_DAILY_CAP", "50") or "50")
    char_cap = int(os.getenv("AKIF_TTS_DAILY_CHARS", "20000") or "20000")
    now = time.time()
    _calls[:] = [t for t in _calls if now - t < 86_400]
    _chars[:] = [(t, n) for t, n in _chars if now - t < 86_400]
    if len(_calls) >= cap or sum(n for _, n in _chars) + chars > char_cap:
        return False
    _calls.append(now)
    _chars.append((now, chars))
    return True


def speech_status() -> dict:
    provider = _provider()
    base = {"provider": provider, "automatic_provider_fallback": False}
    try:
        if provider == "gemini":
            _, model, voice = _config()
            return {**base, "configured": True, "model": model, "voice": voice}
        return {**base, "configured": False, "reason": "tts_provider_unknown"}
    except HTTPException as exc:
        return {**base, "configured": False, "reason": exc.detail}


def wav_to_ogg_opus(wav: bytes, mime: str = "") -> bytes:
    try:
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error"]
        pcm = re.search(r"audio/L16;.*?rate=(\d+)", mime)
        if pcm:  # raw PCM has no header ffmpeg can sniff; state format, rate and channels
            cmd += ["-f", "s16le", "-ar", pcm.group(1), "-ac", "1"]
        done = subprocess.run(
            cmd + ["-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-ac", "1", "-ar", "48000", "-f", "ogg", "pipe:1"],
            input=wav, capture_output=True, timeout=20, check=True)
    except (FileNotFoundError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=503, detail="audio_conversion_unavailable") from exc
    return done.stdout


def synthesize(text: str, conversational: bool = False, language: str = "english") -> bytes:
    # Text checks run first, before any provider is chosen or contacted. Fixed sentences always pass.
    # Conversational text needs AKIF_VOICE_CONVERSATIONAL not "off" and must pass the privacy rules.
    if language not in VOICE_LANGUAGES:
        raise HTTPException(status_code=503, detail="voice_language_not_allowed")
    if not speech_text_allowed(text):
        if not (conversational and os.getenv("AKIF_VOICE_CONVERSATIONAL") != "off" and conversational_text_ok(text)):
            raise HTTPException(status_code=422, detail="text_not_allowed_for_speech")
    provider = _provider()
    if provider == "gemini":
        # Free-quota or provider failure: raise and the caller answers in text.
        return _synthesize_gemini(text, language)
    raise HTTPException(status_code=503, detail="tts_provider_unknown")


# Fixed warm-delivery style per language (owner pick, 2026-11-02). Static instruction text only;
# the spoken sentence is appended after it, already allowlisted or privacy-filtered above.
# Delivery style only - goes into speech_metadata.style, never into the spoken text. The text
# field of the generateContent TTS API is a verbatim transcript, so anything placed there is read
# aloud (the old "Say only this: ..." prompt-in-text was literally spoken). Language is carried by
# the text itself: the API has already translated non-English replies into the target script.
_GEMINI_STYLE = {
    "english": "warm, familiar friend sharing useful news: genuine audible smile, relaxed natural pace, gentle energy",
    "malayalam": "warm trade-broker friend from Kerala: genuine audible smile, relaxed natural pace, gentle energy, native Malayalam speaker",
    "hindi": "warm, familiar friend: genuine audible smile, relaxed natural pace, gentle energy, native Hindi speaker",
    "tamil": "warm, familiar friend: genuine audible smile, relaxed natural pace, gentle energy, native Tamil speaker",
    "arabic": "warm, familiar friend: genuine audible smile, relaxed natural pace, gentle energy, native Arabic speaker",
}


def _synthesize_gemini(text: str, language: str = "english") -> bytes:
    key, model, voice = _config()
    spoken = text.strip()
    if not _daily_cap_ok(len(spoken)):
        raise HTTPException(status_code=429, detail="tts_daily_cap_reached")
    body = {
        "contents": [{"role": "user", "parts": [{"text": spoken,
                                                 "speech_metadata": {"style": _GEMINI_STYLE[language]}}]}],
        "generationConfig": {"responseModalities": ["AUDIO"],
                             "speechConfig": {"voiceConfig": {"voice": voice}}},
    }
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(), method="POST",
        headers={"x-goog-api-key": key, "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:  # no retries
            payload = json.loads(resp.read())
        audio = None
        mime = ""
        for cand in payload.get("candidates", []):
            for part in (cand.get("content") or {}).get("parts", []):
                inline = part.get("inlineData") or part.get("inline_data") or {}
                if inline.get("data"):
                    audio = inline["data"]
                    mime = inline.get("mimeType") or inline.get("mime_type") or ""
                    break
            if audio:
                break
        if not audio:
            raise ValueError("no_audio")
        raw = base64.b64decode(audio)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(json.dumps({"event": "tts_provider_error", "provider": "gemini",
                                   "httpStatus": getattr(exc, "code", None), "providerMessage": ""}))
        raise HTTPException(status_code=502, detail="speech_synthesis_failed") from exc
    return wav_to_ogg_opus(raw, mime)


def audio_seconds(ogg: bytes) -> float | None:
    """Measured length of the generated audio (ffprobe ships with ffmpeg). None if it cannot be measured."""
    try:
        done = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "pipe:0"],
                              input=ogg, capture_output=True, timeout=10, check=True)
        value = float(done.stdout.decode().strip())
        return value if value > 0 else None
    except Exception:
        return None

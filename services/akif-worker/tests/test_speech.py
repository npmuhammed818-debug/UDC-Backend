import pytest
from fastapi import HTTPException

from app import speech


def test_default_deny_exact_allowlist_only():
    assert speech.ALLOWED_TEXTS
    for ok in speech.ALLOWED_TEXTS:
        assert speech.speech_text_allowed(ok)
    for bad in ["Hello Rashid from Acme Traders in Kochi", "Sure, what product do you need?", "Price is 450 per MT", "", "x" * 351]:
        assert not speech.speech_text_allowed(bad), bad
    first = next(iter(speech.ALLOWED_TEXTS))
    assert not speech.speech_text_allowed(first + " ")


def test_disabled_by_default_and_gates(monkeypatch):
    monkeypatch.setenv("AKIF_TTS_PROVIDER", "gemini")
    for k in ["AKIF_VOICE_REPLIES", "GEMINI_API_KEY", "AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", "AKIF_TTS_MODEL"]:
        monkeypatch.delenv(k, raising=False)
    assert speech.speech_status()["reason"] == "voice_replies_disabled"
    monkeypatch.setenv("AKIF_VOICE_REPLIES", "on")
    assert speech.speech_status()["reason"] == "gemini_not_configured"
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    assert speech.speech_status()["reason"] == "gemini_processing_not_enabled"
    monkeypatch.setenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", "true")
    assert speech.speech_status()["model"] == "gemini-3.8-flash-lite-tts"
    monkeypatch.setenv("AKIF_TTS_MODEL", "groq/orpheus")
    assert speech.speech_status()["reason"] == "tts_model_not_allowed"


def test_disallowed_text_never_reaches_provider(monkeypatch):
    called = []
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda *a, **k: called.append(1))
    with pytest.raises(HTTPException) as e:
        speech.synthesize("Hello Rashid from Acme Traders")
    assert e.value.status_code == 422 and not called


def test_daily_cap(monkeypatch):
    monkeypatch.setenv("AKIF_TTS_DAILY_CAP", "1")
    speech._calls.clear()
    assert speech._daily_cap_ok() and not speech._daily_cap_ok()
    speech._calls.clear()


# ---- ElevenLabs adapter (fake HTTP; no network, no key) ----

class _Resp:
    def __init__(self, data): self.data = data
    def read(self): return self.data
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _eleven_env(monkeypatch):
    monkeypatch.setenv("AKIF_TTS_PROVIDER", "elevenlabs")
    monkeypatch.setenv("AKIF_VOICE_REPLIES", "on")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "voice123")
    monkeypatch.delenv("ELEVENLABS_MODEL_ID", raising=False)
    speech._calls.clear()


def test_elevenlabs_disabled_without_key_or_switch(monkeypatch):
    _eleven_env(monkeypatch)
    monkeypatch.delenv("ELEVENLABS_API_KEY")
    assert speech.speech_status()["reason"] == "elevenlabs_not_configured"
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    monkeypatch.delenv("ELEVENLABS_VOICE_ID")
    assert speech.speech_status()["reason"] == "elevenlabs_voice_not_set"
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "voice123")
    monkeypatch.setenv("AKIF_VOICE_REPLIES", "off")
    assert speech.speech_status()["reason"] == "voice_replies_disabled"
    monkeypatch.setenv("AKIF_VOICE_REPLIES", "on")
    assert speech.speech_status() == {"provider": "elevenlabs", "automatic_provider_fallback": False,
                                      "configured": True, "model": "eleven_flash_v2_5"}
    monkeypatch.setenv("ELEVENLABS_MODEL_ID", "something-else")
    assert speech.speech_status()["reason"] == "tts_model_not_allowed"


def test_elevenlabs_sends_only_allowlisted_text_with_key_header(monkeypatch):
    _eleven_env(monkeypatch)
    seen = []
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda req, timeout=None: (seen.append(req), _Resp(b"mp3-bytes"))[1])
    monkeypatch.setattr(speech, "wav_to_ogg_opus", lambda b: b"ogg:" + b)
    text = next(iter(speech.ALLOWED_TEXTS))
    assert speech.synthesize(text) == b"ogg:mp3-bytes"
    req = seen[0]
    assert req.full_url.startswith("https://api.elevenlabs.io/v1/text-to-speech/voice123?")
    assert req.get_header("Xi-api-key") == "test-key"
    import json
    assert json.loads(req.data) == {"text": text.strip(), "model_id": "eleven_flash_v2_5"}


def test_elevenlabs_never_receives_free_text(monkeypatch):
    _eleven_env(monkeypatch)
    called = []
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda *a, **k: called.append(1))
    for bad in ["Hello Rashid from Acme Traders", "Price is 450 per MT", next(iter(speech.ALLOWED_TEXTS)) + " extra"]:
        with pytest.raises(HTTPException) as e:
            speech.synthesize(bad)
        assert e.value.status_code == 422
    assert not called


def test_elevenlabs_failure_is_502_without_switching_provider(monkeypatch):
    _eleven_env(monkeypatch)
    calls = []
    def boom(req, timeout=None):
        calls.append(req.full_url)
        raise OSError("down")
    monkeypatch.setattr(speech.urllib.request, "urlopen", boom)
    with pytest.raises(HTTPException) as e:
        speech.synthesize(next(iter(speech.ALLOWED_TEXTS)))
    assert e.value.status_code == 502 and e.value.detail == "speech_synthesis_failed"
    assert len(calls) == 1 and all("elevenlabs" in c for c in calls)  # one try, no Gemini fallback


def test_elevenlabs_daily_cap_and_unknown_provider(monkeypatch):
    _eleven_env(monkeypatch)
    monkeypatch.setenv("AKIF_TTS_DAILY_CAP", "1")
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda req, timeout=None: _Resp(b"x"))
    monkeypatch.setattr(speech, "wav_to_ogg_opus", lambda b: b)
    text = next(iter(speech.ALLOWED_TEXTS))
    speech.synthesize(text)
    with pytest.raises(HTTPException) as e:
        speech.synthesize(text)
    assert e.value.status_code == 429
    monkeypatch.setenv("AKIF_TTS_PROVIDER", "other")
    assert speech.speech_status()["reason"] == "tts_provider_unknown"
    with pytest.raises(HTTPException) as e:
        speech.synthesize(text)
    assert e.value.status_code == 503
    speech._calls.clear()


SAFE = "Sure. For rice, FOB means the seller loads the cargo on the ship, and you take over from there."


def test_conversational_text_speaks_only_with_flag_and_rules(monkeypatch):
    _eleven_env(monkeypatch)
    seen = []
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda req, timeout=None: (seen.append(req), _Resp(b"mp3"))[1])
    monkeypatch.setattr(speech, "wav_to_ogg_opus", lambda b: b"ogg")
    monkeypatch.setenv("AKIF_TTS_DAILY_CAP", "50")
    speech._calls.clear(); speech._chars.clear()
    with pytest.raises(HTTPException) as e:  # no conversational flag = still the fixed list
        speech.synthesize(SAFE)
    assert e.value.status_code == 422 and not seen
    assert speech.synthesize(SAFE, conversational=True) == b"ogg" and len(seen) == 1
    monkeypatch.setenv("AKIF_VOICE_CONVERSATIONAL", "off")  # kill switch for conversational speech
    with pytest.raises(HTTPException):
        speech.synthesize(SAFE, conversational=True)
    assert len(seen) == 1


def test_conversational_privacy_rules_block_sensitive_text(monkeypatch):
    for bad in [
        "Open https://udc.example/vault/abc to upload", "Mail me at buyer@acme.com", "Call +91 98765 43210",
        "Your OTP is 482913", "Send to bank account 123", "Please confirm the deal in text", "Reply YES to approve",
        "Here is your sign-in code", "x " * 301, "", "  ",
    ]:
        assert not speech.conversational_text_ok(bad), bad
    for ok in [SAFE, "The price is 450 USD per metric ton, and the minimum order is 25 tons.", "नमस्ते, मैं आपकी मदद कर सकता हूँ।", "Gracias, puedo ayudarle con su pedido de arroz."]:
        assert speech.conversational_text_ok(ok), ok


def test_conversational_cost_caps(monkeypatch):
    _eleven_env(monkeypatch)
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda req, timeout=None: _Resp(b"mp3"))
    monkeypatch.setattr(speech, "wav_to_ogg_opus", lambda b: b"ogg")
    speech._calls.clear(); speech._chars.clear()
    monkeypatch.setenv("AKIF_TTS_DAILY_CHARS", str(len(SAFE) * 2))
    speech.synthesize(SAFE, conversational=True); speech.synthesize(SAFE, conversational=True)
    with pytest.raises(HTTPException) as e:
        speech.synthesize(SAFE, conversational=True)
    assert e.value.status_code == 429
    speech._calls.clear(); speech._chars.clear()
    monkeypatch.setenv("AKIF_TTS_DAILY_CHARS", "99999"); monkeypatch.setenv("AKIF_TTS_DAILY_CAP", "1")
    speech.synthesize(SAFE, conversational=True)
    with pytest.raises(HTTPException) as e:
        speech.synthesize(SAFE, conversational=True)
    assert e.value.status_code == 429
    speech._calls.clear(); speech._chars.clear()


def test_conversational_rules_match_api_rules():
    import re, pathlib
    ts = pathlib.Path(__file__).resolve().parents[3].joinpath("artifacts/api-server/src/akif/voiceReply.ts").read_text()
    ts = ts.replace("\\/", "/")
    for pattern in [p.pattern for p in speech._BLOCKED]:
        assert pattern in ts, pattern
    assert "MAX_SPOKEN_CHARS = 600" in ts and speech.MAX_CONVERSATIONAL_CHARS == 600


def test_audio_seconds_measured_or_none(monkeypatch):
    class Done:
        stdout = b"31.4\n"
    monkeypatch.setattr(speech.subprocess, "run", lambda *a, **k: Done())
    assert speech.audio_seconds(b"ogg") == 31.4
    Done.stdout = b"N/A"
    assert speech.audio_seconds(b"ogg") is None
    def boom(*a, **k): raise FileNotFoundError()
    monkeypatch.setattr(speech.subprocess, "run", boom)
    assert speech.audio_seconds(b"ogg") is None

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


# ---- Fake HTTP helpers (no network, no key) ----

class _Resp:
    def __init__(self, data): self.data = data
    def read(self): return self.data
    def __enter__(self): return self
    def __exit__(self, *a): return False


def test_elevenlabs_is_out_of_the_chain(monkeypatch):
    # Owner direction, 14 Nov: nothing may call ElevenLabs, even if its key is still in the env.
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "voice123")
    monkeypatch.setenv("AKIF_TTS_PROVIDER", "elevenlabs")
    monkeypatch.setenv("AKIF_VOICE_REPLIES", "on")
    assert speech.speech_status()["reason"] == "tts_provider_unknown"
    with pytest.raises(HTTPException) as e:
        speech.synthesize(next(iter(speech.ALLOWED_TEXTS)))
    assert e.value.status_code == 503 and e.value.detail == "tts_provider_unknown"
    for gone in ["_synthesize_elevenlabs", "_elevenlabs_config", "_elevenlabs_ready"]:
        assert not hasattr(speech, gone), gone


def test_gemini_is_the_default_provider(monkeypatch):
    monkeypatch.delenv("AKIF_TTS_PROVIDER", raising=False)
    assert speech._provider() == "gemini"


SAFE = "Sure. For rice, FOB means the seller loads the cargo on the ship, and you take over from there."


def _gemini_env(monkeypatch):
    monkeypatch.setenv("AKIF_VOICE_REPLIES", "on")
    monkeypatch.setenv("AKIF_TTS_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", "true")
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.delenv("ELEVENLABS_VOICE_ID", raising=False)
    speech._calls.clear()


def _gemini_ok_response():
    import base64, json
    return _Resp(json.dumps({"candidates": [{"content": {"parts": [
        {"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(b"wav").decode()}}]}}]}).encode())


def test_conversational_text_speaks_only_with_flag_and_rules(monkeypatch):
    _gemini_env(monkeypatch)
    seen = []
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda req, timeout=None: (seen.append(req), _gemini_ok_response())[1])
    monkeypatch.setattr(speech, "wav_to_ogg_opus", lambda b, mime="": b"ogg")
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
    _gemini_env(monkeypatch)
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda req, timeout=None: _gemini_ok_response())
    monkeypatch.setattr(speech, "wav_to_ogg_opus", lambda b, mime="": b"ogg")
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


def test_unknown_language_fails_closed(monkeypatch):
    _gemini_env(monkeypatch)
    called = []
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda *a, **k: called.append(1))
    with pytest.raises(HTTPException) as e:
        speech.synthesize(next(iter(speech.ALLOWED_TEXTS)), language="kannada")
    assert e.value.status_code == 503 and e.value.detail == "voice_language_not_allowed"
    assert not called


def test_gemini_styles_text_and_supports_non_english(monkeypatch):
    _gemini_env(monkeypatch)
    seen = []
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda req, timeout=None: (seen.append(req), _gemini_ok_response())[1])
    monkeypatch.setattr(speech, "wav_to_ogg_opus", lambda b, mime="": b"ogg:" + b)
    text = next(iter(speech.ALLOWED_TEXTS))
    assert speech.synthesize(text, language="malayalam") == b"ogg:wav"
    import json
    part = json.loads(seen[0].data)["contents"][0]["parts"][0]
    assert part["text"] == text, "transcript is verbatim - no instruction text can be spoken"
    assert part["speech_metadata"]["style"] == speech._GEMINI_STYLE["malayalam"], "warm style rides in metadata"
    assert "generateContent" in seen[0].full_url


def test_gemini_quota_or_failure_raises_for_text_reply(monkeypatch):
    # No ElevenLabs fallback: a Gemini failure means the caller answers in text.
    _gemini_env(monkeypatch)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "voice123")
    calls = []
    def quota(req, timeout=None):
        calls.append(req.full_url)
        raise speech.urllib.error.HTTPError(req.full_url, 429, "quota", {}, None)
    monkeypatch.setattr(speech.urllib.request, "urlopen", quota)
    with pytest.raises(HTTPException) as e:
        speech.synthesize(next(iter(speech.ALLOWED_TEXTS)))
    assert e.value.status_code == 502 and e.value.detail == "speech_synthesis_failed"
    assert calls and all("generativelanguage" in c for c in calls), "only Gemini is ever called"


def test_gemini_down_raises_for_text_reply(monkeypatch):
    _gemini_env(monkeypatch)
    monkeypatch.setattr(speech.urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    with pytest.raises(HTTPException) as e:
        speech.synthesize(next(iter(speech.ALLOWED_TEXTS)))
    assert e.value.status_code == 502


def test_provider_error_body_never_logged(monkeypatch, caplog):
    import io
    _gemini_env(monkeypatch)
    speech._calls.clear()
    def fail(req, timeout=None):
        raise speech.urllib.error.HTTPError(req.full_url, 400, 'private echo', {}, io.BytesIO(b'{"detail":"PRIVATE_SYNTHETIC_CONTENT"}'))
    monkeypatch.setattr(speech.urllib.request, 'urlopen', fail)
    with pytest.raises(HTTPException):
        speech.synthesize(next(iter(speech.ALLOWED_TEXTS)))
    assert 'PRIVATE_SYNTHETIC_CONTENT' not in caplog.text
    assert 'private echo' not in caplog.text

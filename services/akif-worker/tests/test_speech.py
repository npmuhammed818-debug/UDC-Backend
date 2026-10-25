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

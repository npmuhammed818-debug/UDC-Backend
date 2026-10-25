import pytest
from fastapi import HTTPException

from app import speech


def test_only_generic_short_text_is_allowed():
    assert speech.speech_text_allowed("Sure, tell me what product you want to buy and where it should go.")
    for bad in ["Price is 450 per MT", "Visit https://x.example", "mail me a@b.co", "Total $5", "", "x" * 351, "Order #12", "Call www.x.com"]:
        assert not speech.speech_text_allowed(bad), bad


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
        speech.synthesize("The price is 450 USD")
    assert e.value.status_code == 422 and not called


def test_daily_cap(monkeypatch):
    monkeypatch.setenv("AKIF_TTS_DAILY_CAP", "1")
    speech._calls.clear()
    assert speech._daily_cap_ok() and not speech._daily_cap_ok()
    speech._calls.clear()

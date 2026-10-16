import sys
from types import SimpleNamespace

import pytest

from app import llm_gateway


def test_groq_requires_key_and_bounds_request(monkeypatch):
    monkeypatch.setenv("AKIF_LLM_MODEL", "groq/test-model")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
        llm_gateway.complete([])
    monkeypatch.setenv("GROQ_API_KEY", "dummy")
    calls = []
    def completion(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="answer"))])
    monkeypatch.setitem(sys.modules, "litellm", SimpleNamespace(completion=completion))
    assert llm_gateway.complete([]) == "answer"
    assert calls[0]["max_retries"] == 0
    assert calls[0]["timeout"] == 20


def test_gemini_requires_explicit_data_processing_opt_in(monkeypatch):
    monkeypatch.setenv("AKIF_LLM_MODEL", "gemini/test-model")
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    monkeypatch.delenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", raising=False)
    with pytest.raises(RuntimeError, match="AKIF_GEMINI_DATA_PROCESSING_ACCEPTED"):
        llm_gateway.complete([])
    monkeypatch.setenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", "true")
    assert llm_gateway._configuration() == ("gemini/test-model", None)

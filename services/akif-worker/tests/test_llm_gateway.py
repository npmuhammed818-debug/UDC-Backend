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
    assert 19 < calls[0]["timeout"] <= 20


def test_gemini_requires_explicit_data_processing_opt_in(monkeypatch):
    monkeypatch.setenv("AKIF_LLM_MODEL", "gemini/test-model")
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    monkeypatch.delenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", raising=False)
    with pytest.raises(RuntimeError, match="AKIF_GEMINI_DATA_PROCESSING_ACCEPTED"):
        llm_gateway.complete([])
    monkeypatch.setenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", "true")
    assert llm_gateway._configuration() == ("gemini/test-model", None)


# ---- failover (fake providers only; nothing here calls a network) ----

class _Err(Exception):
    def __init__(self, status_code):
        self.status_code = status_code


def _fake(monkeypatch, behaviour):
    calls = []

    def completion(**kwargs):
        calls.append(kwargs["model"])
        result = behaviour(kwargs["model"], len([c for c in calls if c == kwargs["model"]]))
        if isinstance(result, Exception):
            raise result
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=result))])
    monkeypatch.setitem(sys.modules, "litellm", SimpleNamespace(completion=completion))
    monkeypatch.setattr(llm_gateway, "_sleep", lambda _s: None)
    return calls


def _env(monkeypatch, gate="true"):
    monkeypatch.setenv("AKIF_LLM_MODEL", "gemini/flash")
    monkeypatch.setenv("AKIF_LLM_BACKUP_MODEL", "groq/backup")
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    monkeypatch.setenv("GROQ_API_KEY", "dummy")
    if gate is None:
        monkeypatch.delenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", raising=False)
    else:
        monkeypatch.setenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", gate)


def test_primary_answers_without_touching_backup(monkeypatch):
    _env(monkeypatch)
    calls = _fake(monkeypatch, lambda m, n: "from " + m)
    assert llm_gateway.complete([]) == "from gemini/flash"
    assert calls == ["gemini/flash"]


def test_429_fails_over_to_backup_immediately_without_retrying_primary(monkeypatch):
    _env(monkeypatch)
    calls = _fake(monkeypatch, lambda m, n: _Err(429) if m.startswith("gemini") else "groq answer")
    assert llm_gateway.complete([]) == "groq answer"
    assert calls == ["gemini/flash", "groq/backup"]  # a backup exists, so no wait and no retry on 429


def test_transient_error_recovers_on_retry_without_failover(monkeypatch):
    _env(monkeypatch)
    calls = _fake(monkeypatch, lambda m, n: TimeoutError() if n == 1 else "ok")
    assert llm_gateway.complete([]) == "ok"
    assert calls == ["gemini/flash", "gemini/flash"]


def test_both_providers_down_raises_after_bounded_attempts(monkeypatch):
    _env(monkeypatch)
    calls = _fake(monkeypatch, lambda m, n: _Err(503))
    with pytest.raises(_Err):
        llm_gateway.complete([])
    assert calls == ["gemini/flash", "gemini/flash", "groq/backup", "groq/backup"]


def test_gate_off_private_content_never_reaches_gemini(monkeypatch):
    _env(monkeypatch, gate=None)
    calls = _fake(monkeypatch, lambda m, n: "from " + m)
    assert llm_gateway.complete([{"role": "user", "content": "deal terms"}]) == "from groq/backup"
    assert calls == ["groq/backup"]
    # and when Groq fails there is no fail-over past the gate into Gemini
    calls2 = _fake(monkeypatch, lambda m, n: _Err(500))
    with pytest.raises(_Err):
        llm_gateway.complete([])
    assert all(c == "groq/backup" for c in calls2)


def test_gate_off_generic_chat_may_use_gemini_then_groq(monkeypatch):
    _env(monkeypatch, gate=None)
    calls = _fake(monkeypatch, lambda m, n: "from " + m)
    assert llm_gateway.complete([], sensitivity="generic") == "from gemini/flash"
    calls2 = _fake(monkeypatch, lambda m, n: _Err(429) if m.startswith("gemini") else "groq")
    assert llm_gateway.complete([], sensitivity="generic") == "groq"
    assert calls2[-1] == "groq/backup"


def test_gate_off_with_only_gemini_refuses_private(monkeypatch):
    monkeypatch.setenv("AKIF_LLM_MODEL", "gemini/flash")
    monkeypatch.delenv("AKIF_LLM_BACKUP_MODEL", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    monkeypatch.delenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED", raising=False)
    calls = _fake(monkeypatch, lambda m, n: "x")
    with pytest.raises(RuntimeError, match="AKIF_GEMINI_DATA_PROCESSING_ACCEPTED"):
        llm_gateway.complete([])
    assert calls == []


def test_unknown_sensitivity_is_treated_as_private(monkeypatch):
    _env(monkeypatch, gate=None)
    calls = _fake(monkeypatch, lambda m, n: "ok")
    llm_gateway.complete([], sensitivity="anything")
    assert calls == ["groq/backup"]


def test_status_reports_fallback_and_private_providers(monkeypatch):
    _env(monkeypatch, gate=None)
    monkeypatch.setitem(sys.modules, "litellm", SimpleNamespace())
    s = llm_gateway.status()
    assert s["automatic_provider_fallback"] is True and s["configured"] is True
    assert s["private_content_providers"] == 1 and s["generic_content_providers"] == 2
    assert s["backup_model"] == "groq/backup"


def test_429_waits_for_retry_after_but_never_past_the_deadline():
    class Resp:
        headers = {"retry-after": "2"}
    class Limited(Exception):
        status_code = 429
        response = Resp()
    assert llm_gateway._retry_wait(Limited(), 13) == 2.0
    assert llm_gateway._retry_wait(Limited(), 2.5) == 1.5
    Resp.headers = {"retry-after": "60"}
    assert llm_gateway._retry_wait(Limited(), 13) == llm_gateway.MAX_RATE_LIMIT_WAIT_SECONDS
    Resp.headers = {}
    assert llm_gateway._retry_wait(Limited(), 13) == 1.5
    assert llm_gateway._retry_wait(RuntimeError("x"), 13) == llm_gateway.RETRY_BACKOFF_SECONDS


def test_429_on_both_models_still_ends_after_one_retry_on_the_last(monkeypatch):
    _env(monkeypatch)
    calls = _fake(monkeypatch, lambda m, n: _Err(429))
    with pytest.raises(_Err):
        llm_gateway.complete([])
    assert calls == ["gemini/flash", "groq/backup", "groq/backup"]

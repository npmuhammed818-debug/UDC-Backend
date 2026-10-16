from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app import chat, llm_gateway


def test_chat_preserves_udc_system_rules_and_deadline(monkeypatch):
    monkeypatch.setattr(chat, "status", lambda: {"configured": True, "model": "groq/test"})
    calls = []
    def complete(messages, timeout_seconds):
        calls.append((messages, timeout_seconds))
        return '{"replyToSender":"What quantity do you need?"}'
    monkeypatch.setattr(chat, "complete", complete)
    result = chat.chat_completion(chat.ChatRequest(messages=[
        chat.ChatMessage(role="system", content="DLC after SGS at destination."),
        chat.ChatMessage(role="user", content="I need copper"),
    ], timeout_seconds=12))
    assert calls[0][0][0]["content"] == "DLC after SGS at destination."
    assert calls[0][1] == 12
    assert result["choices"][0]["message"]["content"].startswith('{"replyToSender"')


def test_chat_configuration_and_provider_failures_are_safe(monkeypatch):
    request = chat.ChatRequest(messages=[chat.ChatMessage(role="user", content="test")])
    monkeypatch.setattr(chat, "status", lambda: {"configured": False})
    with pytest.raises(HTTPException) as error:
        chat.chat_completion(request)
    assert error.value.status_code == 503
    monkeypatch.setattr(chat, "status", lambda: {"configured": True, "model": "test"})
    def fail(*args, **kwargs):
        raise RuntimeError("SECRET_MUST_NOT_LEAK")
    monkeypatch.setattr(chat, "complete", fail)
    with pytest.raises(HTTPException) as error:
        chat.chat_completion(request)
    assert error.value.status_code == 502
    assert "SECRET" not in error.value.detail


def test_chat_bounds_payload_and_timeout():
    with pytest.raises(ValidationError):
        chat.ChatRequest(messages=[], timeout_seconds=50)
    with pytest.raises(ValidationError):
        chat.ChatRequest(messages=[chat.ChatMessage(role="user", content="x" * 80_000)] * 2)


def test_probe_sends_only_fixed_text_and_hides_provider_errors(monkeypatch):
    monkeypatch.setattr(llm_gateway, "status", lambda: {"configured": True, "model": "test"})
    def fail(messages, timeout_seconds):
        assert messages == [{"role": "user", "content": "Reply only with AKIF_READY."}]
        raise RuntimeError("SECRET_MUST_NOT_LEAK")
    monkeypatch.setattr(llm_gateway, "complete", fail)
    result = llm_gateway.probe()
    assert result["status"] == "failed"
    assert result["error_type"] == "RuntimeError"
    assert "SECRET" not in str(result)

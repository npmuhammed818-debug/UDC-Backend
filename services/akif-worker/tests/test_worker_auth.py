import os
import pytest
from fastapi.testclient import TestClient
from app.main import app


def test_internal_chat_and_media_require_worker_token(monkeypatch):
    monkeypatch.setenv("AKIF_WORKER_TOKEN", "test-internal-token")
    monkeypatch.delenv("AKIF_STARTUP_MODEL_PROBE", raising=False)
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    assert client.post("/chat/completions", json={"messages":[{"role":"user","content":"test"}]}).status_code == 401
    assert client.post("/media/image/transcribe", json={"mime_type":"image/png","base64":"eA=="}).status_code == 401
    assert client.post("/media/audio/transcribe", files={"file":("voice.ogg",b"OggS","audio/ogg")}).status_code == 401


def test_startup_reports_safe_failure_and_still_checks_gemini(monkeypatch, capsys):
    import asyncio
    import app.main as worker
    monkeypatch.setenv("AKIF_STARTUP_GEMINI_PROBE", "true")
    def broken_sdk():
        raise ValueError("private provider diagnostic must not appear")
    monkeypatch.setattr(worker, "model_probe", broken_sdk)
    monkeypatch.setattr(worker, "gemini_probe", lambda: {"provider": "gemini", "status": "passed"})
    asyncio.run(worker._startup_probe())
    output = capsys.readouterr().out
    assert '"error_type": "ValueError"' in output
    assert '"provider": "gemini", "status": "passed"' in output
    assert "private provider diagnostic" not in output

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

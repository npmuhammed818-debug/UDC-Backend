import io
import base64
from PIL import Image
from fastapi.testclient import TestClient
from services.document_extractor.app import app


def test_image_is_normalized_for_vision_after_authentication(monkeypatch):
    monkeypatch.setenv("DOCUMENT_EXTRACTOR_TOKEN", "extractor-test")
    client = TestClient(app)
    image = io.BytesIO()
    Image.new("RGB", (16, 16), "white").save(image, format="PNG")
    file = ("photo.png", image.getvalue(), "image/png")
    assert client.post("/extract", files={"file":file}).status_code == 401
    response=client.post("/extract", headers={"Authorization":"Bearer extractor-test"}, files={"file":file})
    assert response.status_code == 200
    data=response.json()
    assert data["text"] == ""
    assert data["page_count"] == 1
    assert data["vision_pages"][0]["mime_type"] == "image/jpeg"
    assert base64.b64decode(data["vision_pages"][0]["base64"]).startswith(b"\xff\xd8\xff")


def test_invalid_image_does_not_become_extracted_evidence(monkeypatch):
    monkeypatch.setenv("DOCUMENT_EXTRACTOR_TOKEN", "extractor-test")
    response=TestClient(app).post("/extract", headers={"Authorization":"Bearer extractor-test"},
        files={"file":("photo.png",b"not-an-image","image/png")})
    assert response.status_code == 422

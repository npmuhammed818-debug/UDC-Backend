"""Real-format PDF fixtures, not model extraction or authenticity evidence."""
import io
from fastapi.testclient import TestClient
from services.document_extractor.app import app


def invoice_pdf():
    # Minimal valid one-page PDF, with real text operators and cross-reference.
    lines = ["SYNTHETIC INVOICE - NOT FOR TRADE", "Quantity: 11 MT", "Unit price: 100 USD per MT", "Incoterm: FOB", "Destination: Dubai"]
    stream = "BT /F1 12 Tf 50 750 Td " + " 0 -20 Td ".join(f"({line}) Tj" for line in lines) + " ET"
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream".encode()]
    data = bytearray(b"%PDF-1.4\n"); offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(data)); data.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(data); data.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]: data.extend(f"{offset:010} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(data)


def test_real_pdf_text_preserves_mismatching_terms_after_authenticated_upload(monkeypatch):
    monkeypatch.setenv("DOCUMENT_EXTRACTOR_TOKEN", "synthetic-test-token")
    client = TestClient(app)
    fixture = ("synthetic-invoice.pdf", invoice_pdf(), "application/pdf")
    assert client.post("/extract", files={"file": fixture}).status_code == 401
    result = client.post("/extract", headers={"Authorization": "Bearer synthetic-test-token"}, files={"file": fixture})
    assert result.status_code == 200
    body = result.json()
    assert body["page_count"] == 1
    assert body["extraction_method"] == "pypdf+pypdfium2"
    assert "Quantity: 11 MT" in body["text"]
    assert "Unit price: 100 USD per MT" in body["text"]
    assert "SYNTHETIC INVOICE - NOT FOR TRADE" in body["text"]
    assert body["vision_pages"] == []
    assert body["warnings"] == []


def test_claimed_pdf_malformed_bytes_are_not_evidence(monkeypatch):
    monkeypatch.setenv("DOCUMENT_EXTRACTOR_TOKEN", "synthetic-test-token")
    response = TestClient(app).post("/extract", headers={"Authorization": "Bearer synthetic-test-token"}, files={"file": ("invoice.pdf", b"not a PDF", "application/pdf")})
    assert response.status_code == 422


def test_real_extracted_fixture_reaches_exact_checker_without_payment_approval(monkeypatch):
    import json
    import re
    import subprocess
    from pathlib import Path
    monkeypatch.setenv("DOCUMENT_EXTRACTOR_TOKEN", "synthetic-test-token")
    response = TestClient(app).post("/extract", headers={"Authorization": "Bearer synthetic-test-token"}, files={"file": ("invoice.pdf", invoice_pdf(), "application/pdf")})
    assert response.status_code == 200
    text = response.json()["text"]
    # Reviewed fixture-only mapping. This is NOT the production model extraction.
    quantity = re.search(r"Quantity: (\d+) (MT)", text)
    price = re.search(r"Unit price: (\d+) (USD) per (MT)", text)
    assert quantity and price
    structured = {"quantity": {"value": quantity[1], "unit": quantity[2]}, "pricing": {"unitPrice": price[1], "currency": price[2], "basis": price[3]}, "logistics": {"incoterm": "FOB", "destination": "Dubai"}}
    repo = Path(__file__).resolve().parents[3]
    program = """import {documentCheck} from './artifacts/api-server/src/deals/documentCheck.ts';let raw='';for await(const x of process.stdin)raw+=x;const result=documentCheck({quantity:'10',unit:'MT',agreedPrice:'100',currency:'USD',incoterm:'FOB',destination:'Dubai'},JSON.parse(raw));console.log(JSON.stringify(result));"""
    result = subprocess.run(["node", "--experimental-strip-types", "--input-type=module", "-e", program], cwd=repo, input=json.dumps(structured), text=True, capture_output=True, check=True)
    checked = json.loads(result.stdout)
    assert next(c for c in checked["checks"] if c["field"] == "quantity")["state"] == "mismatch"
    assert next(c for c in checked["checks"] if c["field"] == "unit_price")["state"] == "match"
    assert checked["needsHumanReview"] is True
    assert checked["authenticityVerified"] is False

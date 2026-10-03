from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field


class DocumentText(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=500_000)


class DocumentCompareRequest(BaseModel):
    documents: list[DocumentText] = Field(min_length=2, max_length=10)


class DocumentFinding(BaseModel):
    field: str
    values: dict[str, Any]
    status: str


class DocumentCompareResponse(BaseModel):
    findings: list[DocumentFinding]
    warnings: list[str]


INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"]
PAYMENT_TERMS = ["DLC", "LC", "SBLC", "MT103", "TT", "T/T", "BG"]


def _extract(text: str) -> dict[str, Any]:
    upper = text.upper()
    incoterms = sorted({term for term in INCOTERMS if re.search(rf"\b{re.escape(term)}\b", upper)})
    payments = sorted({
        term
        for term in PAYMENT_TERMS
        if re.search(rf"\b{re.escape(term)}\b", upper)
    })
    quantities = sorted({
        m.group(0).strip()
        for m in re.finditer(r"\b[\d,.]+\s*(?:MT|METRIC TONS?|TONNES?|KG|KGS)\b", upper)
    })[:10]
    prices = sorted({
        m.group(0).strip()
        for m in re.finditer(r"(?:USD|US\$|\$|AED|EUR|€|INR|₹)\s*[\d,.]+(?:\s*/\s*(?:MT|KG|TONNE))?", upper)
    })[:10]
    return {
        "incoterms": incoterms,
        "payment_terms": payments,
        "quantities": quantities,
        "prices": prices,
    }


def compare_documents(request: DocumentCompareRequest) -> DocumentCompareResponse:
    extracted = {document.label: _extract(document.text) for document in request.documents}
    findings: list[DocumentFinding] = []

    for field in ["incoterms", "payment_terms", "quantities", "prices"]:
        values = {label: data[field] for label, data in extracted.items()}
        canonical = {tuple(value) for value in values.values()}
        status = "consistent" if len(canonical) == 1 else "different"
        findings.append(DocumentFinding(field=field, values=values, status=status))

    warnings = [
        "AKIF compares machine-extracted terms and may miss wording, tables or legal nuance.",
        "A consistent document set is not proof of authenticity or legal validity.",
        "Any banking, payment, legal or verification decision requires authorized human review.",
    ]
    return DocumentCompareResponse(findings=findings, warnings=warnings)

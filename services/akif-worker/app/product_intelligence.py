from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field

from .llm_gateway import complete, status as llm_status


class HsCandidate(BaseModel):
    code: str
    description: str
    confidence: Literal["low", "medium", "high"]
    basis: str


class ProductIntelligenceRequest(BaseModel):
    product: str = Field(min_length=2, max_length=300)
    origin_country: str | None = Field(default=None, max_length=120)
    destination_country: str | None = Field(default=None, max_length=120)
    use_llm_fallback: bool = True


class ProductIntelligenceResponse(BaseModel):
    normalized_product: str
    hs_candidates: list[HsCandidate]
    requires_customs_confirmation: bool = True
    notes: list[str] = Field(default_factory=list)


_CURATED: list[tuple[re.Pattern[str], list[HsCandidate]]] = [
    (
        re.compile(r"\b(cashew|cashew nuts?).*\b(shelled|kernel|w320|w240)\b|\b(w320|w240)\b", re.I),
        [HsCandidate(code="080132", description="Cashew nuts, shelled", confidence="high", basis="curated HS reference")],
    ),
    (
        re.compile(r"\bcashew\b", re.I),
        [
            HsCandidate(code="080131", description="Cashew nuts, in shell", confidence="medium", basis="curated HS reference"),
            HsCandidate(code="080132", description="Cashew nuts, shelled", confidence="medium", basis="curated HS reference"),
        ],
    ),
    (
        re.compile(r"\bcopper\s+cathode", re.I),
        [HsCandidate(code="740311", description="Refined copper cathodes and sections of cathodes", confidence="high", basis="curated HS reference")],
    ),
    (
        re.compile(r"\b(copper.*scrap|millberry|copper wire scrap)\b", re.I),
        [HsCandidate(code="740400", description="Copper waste and scrap", confidence="medium", basis="curated HS reference")],
    ),
    (
        re.compile(r"\bapple(s)?\b", re.I),
        [HsCandidate(code="080810", description="Fresh apples", confidence="high", basis="curated HS reference")],
    ),
    (
        re.compile(r"\b(refined|white|icumsa|s2[- ]?30).*sugar|\bsugar\b", re.I),
        [HsCandidate(code="170199", description="Other cane or beet sugar and chemically pure sucrose, in solid form", confidence="medium", basis="curated HS reference")],
    ),
    (
        re.compile(r"\bgoat\s+(meat|carcass)", re.I),
        [
            HsCandidate(code="020450", description="Meat of goats", confidence="medium", basis="curated HS heading; condition/cut may alter sub-classification"),
        ],
    ),
]


def _normalize(product: str) -> str:
    return " ".join(product.strip().split())


def analyze_product(request: ProductIntelligenceRequest) -> ProductIntelligenceResponse:
    normalized = _normalize(request.product)
    candidates: list[HsCandidate] = []
    for pattern, mapped in _CURATED:
        if pattern.search(normalized):
            candidates = mapped
            break

    notes = [
        "HS suggestions are classification assistance only; final customs classification depends on exact composition, condition, processing and local tariff schedules."
    ]

    if not candidates and request.use_llm_fallback and llm_status()["configured"]:
        prompt = (
            "Return only likely 6-digit HS codes and short descriptions for this product, "
            "clearly treating them as candidates requiring customs confirmation: "
            f"{normalized}"
        )
        try:
            text = complete([
                {"role": "system", "content": "You assist with international trade product classification. Never claim a classification is final."},
                {"role": "user", "content": prompt},
            ])
            for code, description in re.findall(r"\b(\d{6})\b\s*[-:–]?\s*([^\n]{1,160})", text):
                candidates.append(
                    HsCandidate(
                        code=code,
                        description=description.strip(),
                        confidence="low",
                        basis="LLM fallback",
                    )
                )
            if candidates:
                notes.append("LLM fallback was used because no curated mapping matched.")
        except Exception:
            notes.append("LLM fallback was configured but did not return a usable classification.")

    if not candidates:
        notes.append("No confident HS candidate is available yet; request more product detail or use an official tariff source.")

    return ProductIntelligenceResponse(
        normalized_product=normalized,
        hs_candidates=candidates[:5],
        notes=notes,
    )

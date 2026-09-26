import os
import secrets

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile

from .documents import extract_document
from .document_compare import DocumentCompareRequest, DocumentCompareResponse, compare_documents
from .economics import LandedCostRequest, LandedCostResponse, calculate_landed_cost
from .entity_resolution import dedupe_entities
from .learn import LearnRequest, LearnResponse, explain_topic
from .market_analysis import MarketAnalysisRequest, MarketAnalysisResponse, analyze_market
from .product_intelligence import ProductIntelligenceRequest, ProductIntelligenceResponse, analyze_product
from .verification import VerificationAssessment, VerificationSignals, assess_verification
from .llm_gateway import status as llm_status
from .models import (
    ComtradePreviewRequest,
    ComtradePreviewResponse,
    DocumentExtractionResponse,
    EntityDedupeRequest,
    EntityDedupeResponse,
)
from .orchestration import status as orchestration_status
from .trade_data import preview_comtrade

app = FastAPI(
    title="UDC AKIF Intelligence Worker",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


def require_internal_token(
    x_akif_worker_token: str | None = Header(default=None),
) -> None:
    expected = os.getenv("AKIF_WORKER_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="worker_token_not_configured")
    if not x_akif_worker_token or not secrets.compare_digest(
        x_akif_worker_token,
        expected,
    ):
        raise HTTPException(status_code=401, detail="invalid_worker_token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "akif-worker"}


@app.get("/capabilities", dependencies=[Depends(require_internal_token)])
def capabilities() -> dict:
    return {
        "service": "akif-worker",
        "capabilities": {
            "document_extraction": {
                "enabled": True,
                "engine": "docling",
            },
            "entity_resolution": {
                "enabled": True,
                "engine": "splink",
                "fallback": "rapidfuzz",
            },
            "trade_data": {
                "un_comtrade_preview": {
                    "enabled": True,
                    "max_records": 500,
                    "subscription_key_required": False,
                }
            },
            "product_intelligence": {"enabled": True, "hs_candidate_mode": True},
            "market_analysis": {"enabled": True},
            "landed_cost": {"enabled": True},
            "verification_assistance": {"enabled": True, "human_decision_required": True},
            "document_comparison": {"enabled": True},
            "akif_learn": {"enabled": True},
            "orchestration": orchestration_status(),
            "llm_gateway": llm_status(),
        },
        "guardrails": {
            "entity_match_is_verification": False,
            "document_parse_is_authenticity_check": False,
            "human_review_for_sensitive_decisions": True,
        },
    }


@app.post(
    "/entities/dedupe",
    response_model=EntityDedupeResponse,
    dependencies=[Depends(require_internal_token)],
)
def entities_dedupe(request: EntityDedupeRequest) -> EntityDedupeResponse:
    return dedupe_entities(request)


@app.post(
    "/documents/extract",
    response_model=DocumentExtractionResponse,
    dependencies=[Depends(require_internal_token)],
)
async def documents_extract(
    file: UploadFile = File(...),
) -> DocumentExtractionResponse:
    return await extract_document(file)


@app.post(
    "/trade/comtrade/preview",
    response_model=ComtradePreviewResponse,
    dependencies=[Depends(require_internal_token)],
)
def trade_comtrade_preview(
    request: ComtradePreviewRequest,
) -> ComtradePreviewResponse:
    return preview_comtrade(request)


@app.post(
    "/product/analyze",
    response_model=ProductIntelligenceResponse,
    dependencies=[Depends(require_internal_token)],
)
def product_analyze(request: ProductIntelligenceRequest) -> ProductIntelligenceResponse:
    return analyze_product(request)


@app.post(
    "/market/analyze",
    response_model=MarketAnalysisResponse,
    dependencies=[Depends(require_internal_token)],
)
def market_analyze(request: MarketAnalysisRequest) -> MarketAnalysisResponse:
    return analyze_market(request)


@app.post(
    "/economics/landed-cost",
    response_model=LandedCostResponse,
    dependencies=[Depends(require_internal_token)],
)
def economics_landed_cost(request: LandedCostRequest) -> LandedCostResponse:
    return calculate_landed_cost(request)


@app.post(
    "/verification/assess",
    response_model=VerificationAssessment,
    dependencies=[Depends(require_internal_token)],
)
def verification_assess(request: VerificationSignals) -> VerificationAssessment:
    return assess_verification(request)


@app.post(
    "/documents/compare",
    response_model=DocumentCompareResponse,
    dependencies=[Depends(require_internal_token)],
)
def documents_compare(request: DocumentCompareRequest) -> DocumentCompareResponse:
    return compare_documents(request)


@app.post(
    "/learn/explain",
    response_model=LearnResponse,
    dependencies=[Depends(require_internal_token)],
)
def learn_explain(request: LearnRequest) -> LearnResponse:
    return explain_topic(request)

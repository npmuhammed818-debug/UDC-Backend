import os
import asyncio
import json
from contextlib import asynccontextmanager, suppress
import secrets

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field as _Field
from app.speech import audio_seconds, speech_status, synthesize

from .media import ImageRequest, transcribe_image, transcribe_audio, gemini_probe, MAX_AUDIO_BYTES, vision_status
from .chat import ChatRequest, chat_completion
from .llm_gateway import probe as model_probe, initialize_sdk
from .documents import extract_document
from .company_identity import GleifCompanySearchRequest, GleifCompanySearchResponse, search_gleif
from .compliance import OfacScreenRequest, OfacScreenResponse, screen_ofac
from .document_compare import DocumentCompareRequest, DocumentCompareResponse, compare_documents
from .economics import LandedCostRequest, LandedCostResponse, calculate_landed_cost
from .entity_resolution import dedupe_entities
from .learn import LearnRequest, LearnResponse, explain_topic
from .market_analysis import MarketAnalysisRequest, MarketAnalysisResponse, analyze_market
from .product_intelligence import ProductIntelligenceRequest, ProductIntelligenceResponse, analyze_product
from .reasoning import ReasoningRequest, ReasoningResponse, reason
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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # LiteLLM installs global logging filters while importing. Importing it in a
    # background thread can deadlock with request logging during a cold start.
    # Complete initialization synchronously before yielding to the HTTP server.
    initialize_sdk()
    task = asyncio.create_task(_startup_probe()) if os.getenv("AKIF_STARTUP_MODEL_PROBE") == "true" else None
    try:
        yield
    finally:
        if task and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(
    title="UDC AKIF Intelligence Worker",
    lifespan=lifespan,
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
            "official_identity": {
                "gleif": {
                    "enabled": True,
                    "authentication_required": False,
                    "data_license": "CC0-1.0",
                }
            },
            "compliance_screening": {
                "ofac": {
                    "enabled": True,
                    "scope": "US_OFAC_ONLY",
                    "human_review_required": True,
                }
            },
            "document_comparison": {"enabled": True},
            "akif_learn": {"enabled": True},
            "model_reasoning": {
                "enabled": llm_status()["configured"],
                "provider_neutral": True,
            },
            "orchestration": orchestration_status(),
            "llm_gateway": llm_status(),
            "media": {
                "image_transcription": vision_status(),
                "voice_transcription_configured": bool(os.getenv("GROQ_API_KEY")),
                "gemini_image_configured": bool(os.getenv("GEMINI_API_KEY") and os.getenv("AKIF_GEMINI_MODEL") and os.getenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED") == "true"),
                "voice_requires_text_confirmation": True,
            },
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


@app.post(
    "/reasoning/analyze",
    response_model=ReasoningResponse,
    dependencies=[Depends(require_internal_token)],
)
def reasoning_analyze(request: ReasoningRequest) -> ReasoningResponse:
    return reason(request)


@app.post(
    "/company/gleif/search",
    response_model=GleifCompanySearchResponse,
    dependencies=[Depends(require_internal_token)],
)
def company_gleif_search(
    request: GleifCompanySearchRequest,
) -> GleifCompanySearchResponse:
    return search_gleif(request)


@app.post(
    "/compliance/ofac/screen",
    response_model=OfacScreenResponse,
    dependencies=[Depends(require_internal_token)],
)
def compliance_ofac_screen(
    request: OfacScreenRequest,
) -> OfacScreenResponse:
    return screen_ofac(request)


async def _startup_probe() -> None:
    try:
        result = await asyncio.to_thread(model_probe)
    except Exception as exc:
        result = {"status": "failed", "error_type": type(exc).__name__}
    # Only these fixed safe fields are printed. Avoid SDK-installed logging filters:
    # failed SDK initialization can leave those filters unable to log diagnostics.
    print("AKIF model startup probe: " + json.dumps(result), flush=True)
    if os.getenv("AKIF_STARTUP_GEMINI_PROBE") == "true":
        try:
            secondary = await asyncio.to_thread(gemini_probe)
        except Exception as exc:
            secondary = {"status": "failed", "error_type": type(exc).__name__}
        print("AKIF Gemini startup probe: " + json.dumps(secondary), flush=True)



@app.post("/chat/completions", dependencies=[Depends(require_internal_token)])
def internal_chat_completion(request: ChatRequest) -> dict:
    return chat_completion(request)


@app.post("/media/image/transcribe", dependencies=[Depends(require_internal_token)])
def image_transcription(request: ImageRequest) -> dict:
    return transcribe_image(request)


@app.post("/media/audio/transcribe", dependencies=[Depends(require_internal_token)])
async def audio_transcription(file: UploadFile = File(...)) -> dict:
    data = await file.read(MAX_AUDIO_BYTES + 1)
    return await asyncio.to_thread(transcribe_audio, data, file.filename or "voice", file.content_type or "")


class SpeechRequest(BaseModel):
    text: str = _Field(min_length=1, max_length=600)
    conversational: bool = False


@app.get("/speech/status", dependencies=[Depends(require_internal_token)])
def speech_status_route() -> dict:
    return speech_status()


@app.post("/speech/synthesize", dependencies=[Depends(require_internal_token)])
def speech_synthesize(request: SpeechRequest) -> Response:
    audio = synthesize(request.text, request.conversational)
    seconds = audio_seconds(audio)
    return Response(content=audio, media_type="audio/ogg", headers={"x-audio-seconds": f"{seconds:.1f}"} if seconds else {})

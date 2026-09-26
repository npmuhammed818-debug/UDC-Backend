from fastapi import FastAPI, File, UploadFile

from .documents import extract_document
from .entity_resolution import dedupe_entities
from .llm_gateway import status as llm_status
from .models import DocumentExtractionResponse, EntityDedupeRequest, EntityDedupeResponse
from .orchestration import status as orchestration_status

app = FastAPI(
    title="UDC AKIF Intelligence Worker",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "akif-worker"}


@app.get("/capabilities")
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
            "orchestration": orchestration_status(),
            "llm_gateway": llm_status(),
        },
        "guardrails": {
            "entity_match_is_verification": False,
            "document_parse_is_authenticity_check": False,
            "human_review_for_sensitive_decisions": True,
        },
    }


@app.post("/entities/dedupe", response_model=EntityDedupeResponse)
def entities_dedupe(request: EntityDedupeRequest) -> EntityDedupeResponse:
    return dedupe_entities(request)


@app.post("/documents/extract", response_model=DocumentExtractionResponse)
async def documents_extract(
    file: UploadFile = File(...),
) -> DocumentExtractionResponse:
    return await extract_document(file)

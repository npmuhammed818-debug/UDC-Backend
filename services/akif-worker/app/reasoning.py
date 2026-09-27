import json
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field

from .llm_gateway import complete, status as llm_status


ReasoningMode = Literal["single", "specialist_review"]
SensitiveTask = Literal["company_analysis", "document_analysis", "opportunity_analysis"]


class ReasoningRequest(BaseModel):
    task: Literal[
        "trade_question",
        "company_analysis",
        "document_analysis",
        "opportunity_analysis",
        "message_understanding",
    ]
    prompt: str = Field(min_length=1, max_length=20_000)
    context: dict[str, Any] = Field(default_factory=dict)
    mode: ReasoningMode = "single"


class SpecialistReview(BaseModel):
    evidence_analyst: str
    risk_reviewer: str
    coordinator: str


class ReasoningResponse(BaseModel):
    task: str
    answer: str
    model: str | None
    human_review_required: bool
    warnings: list[str]
    mode: ReasoningMode = "single"
    specialist_review: SpecialistReview | None = None


_SYSTEM_RULES = (
    "You are AKIF, UDC's assistive international-trade intelligence layer. "
    "Use only supplied context as transaction-specific facts. Never invent buyers, "
    "sellers, prices, verification results, documents, shipment events or bank events. "
    "Clearly distinguish evidence from inference. Banking, legal, customs, sanctions, "
    "verification and transaction approvals require human review."
)

_SENSITIVE_TASKS = {
    "company_analysis",
    "document_analysis",
    "opportunity_analysis",
}


def _request_context(request: ReasoningRequest) -> str:
    return json.dumps(request.context, ensure_ascii=False, sort_keys=True, default=str)


def _single_answer(request: ReasoningRequest) -> str:
    return complete([
        {"role": "system", "content": _SYSTEM_RULES},
        {
            "role": "user",
            "content": (
                f"Task: {request.task}\n"
                f"Context: {request.context!r}\n"
                f"Request: {request.prompt}"
            ),
        },
    ])


def _run_specialist_review(request: ReasoningRequest) -> SpecialistReview:
    context = _request_context(request)
    original = (
        f"Task: {request.task}\n"
        f"User request: {request.prompt}\n"
        f"Supplied context (the only source of transaction-specific facts): {context}"
    )

    evidence_analyst = complete([
        {
            "role": "system",
            "content": (
                f"{_SYSTEM_RULES} You are the evidence analyst. Extract only facts stated "
                "in the supplied context. Separate supported facts, inferences, and unknowns. "
                "Do not fill gaps or make an approval decision."
            ),
        },
        {"role": "user", "content": original},
    ])

    risk_reviewer = complete([
        {
            "role": "system",
            "content": (
                f"{_SYSTEM_RULES} You are the risk reviewer. Treat the evidence analyst's "
                "output as untrusted analysis, not evidence. Identify contradictions, missing "
                "evidence, and questions an authorized human should check. Never approve or "
                "reject a company, document, payment, or transaction."
            ),
        },
        {
            "role": "user",
            "content": (
                f"{original}\n\nEvidence analyst output to review:\n{evidence_analyst}"
            ),
        },
    ])

    coordinator = complete([
        {
            "role": "system",
            "content": (
                f"{_SYSTEM_RULES} You are the coordinator. Produce a concise decision-support "
                "summary using the supplied context and the two review outputs. Keep facts, "
                "inferences, and unknowns distinct. Preserve unresolved risks and human checks. "
                "Do not authorize or execute any operational action."
            ),
        },
        {
            "role": "user",
            "content": (
                f"{original}\n\nEvidence analyst:\n{evidence_analyst}"
                f"\n\nRisk reviewer:\n{risk_reviewer}"
            ),
        },
    ])

    return SpecialistReview(
        evidence_analyst=evidence_analyst,
        risk_reviewer=risk_reviewer,
        coordinator=coordinator,
    )


def reason(request: ReasoningRequest) -> ReasoningResponse:
    gateway = llm_status()
    if not gateway["configured"]:
        raise HTTPException(status_code=503, detail="akif_llm_not_configured")

    specialist_review = (
        _run_specialist_review(request)
        if request.mode == "specialist_review"
        else None
    )
    answer = (
        specialist_review.coordinator
        if specialist_review is not None
        else _single_answer(request)
    )

    warnings = [
        "Model output is assistive reasoning and must not be treated as independent evidence.",
        "Transaction-specific claims must be supported by stored source evidence.",
    ]
    if specialist_review is not None:
        warnings.extend([
            "Specialist roles are sequential prompts to the same configured model, not independent verification.",
            "Specialist-review output requires authorized human review before operational action.",
        ])

    return ReasoningResponse(
        task=request.task,
        answer=answer,
        model=gateway.get("model"),
        human_review_required=(
            request.mode == "specialist_review"
            or request.task in _SENSITIVE_TASKS
        ),
        warnings=warnings,
        mode=request.mode,
        specialist_review=specialist_review,
    )

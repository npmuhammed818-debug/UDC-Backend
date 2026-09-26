from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field

from .llm_gateway import complete, status as llm_status


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


class ReasoningResponse(BaseModel):
    task: str
    answer: str
    model: str | None
    human_review_required: bool
    warnings: list[str]


def reason(request: ReasoningRequest) -> ReasoningResponse:
    gateway = llm_status()
    if not gateway["configured"]:
        raise HTTPException(status_code=503, detail="akif_llm_not_configured")

    context_text = repr(request.context)
    answer = complete([
        {
            "role": "system",
            "content": (
                "You are AKIF, UDC's assistive international-trade intelligence layer. "
                "Use only supplied context as transaction-specific facts. Never invent buyers, "
                "sellers, prices, verification results, documents, shipment events or bank events. "
                "Clearly distinguish evidence from inference. Banking, legal, customs, sanctions, "
                "verification and transaction approvals require human review."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Task: {request.task}\n"
                f"Context: {context_text}\n"
                f"Request: {request.prompt}"
            ),
        },
    ])

    return ReasoningResponse(
        task=request.task,
        answer=answer,
        model=gateway.get("model"),
        human_review_required=request.task in {
            "company_analysis",
            "document_analysis",
            "opportunity_analysis",
        },
        warnings=[
            "Model output is assistive reasoning and must not be treated as independent evidence.",
            "Transaction-specific claims must be supported by stored source evidence.",
        ],
    )

import json

from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator
from typing import Literal

from .llm_gateway import complete, status


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=100_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    timeout_seconds: float = Field(default=13, ge=1, le=20)
    # "generic" only when the caller guarantees no deal, account or user data is in the messages.
    sensitivity: Literal["private", "generic"] = "private"

    @model_validator(mode="after")
    def bound_context(self):
        if sum(len(message.content) for message in self.messages) > 150_000:
            raise ValueError("chat_context_too_large")
        return self


def chat_completion(request: ChatRequest) -> dict:
    gateway = status()
    if not gateway["configured"]:
        raise HTTPException(status_code=503, detail="akif_llm_not_configured")
    try:
        content = complete([message.model_dump() for message in request.messages],
                           timeout_seconds=request.timeout_seconds, sensitivity=request.sensitivity)
    except Exception as exc:
        # Do not return provider error messages; they can contain request data or secrets.
        provider_status = getattr(exc, "status_code", None)
        print("AKIF chat provider failure: " + json.dumps({
            "error_type": type(exc).__name__,
            "http_status": provider_status if type(provider_status) is int else None,
            "message_count": len(request.messages),
            "input_characters": sum(len(message.content) for message in request.messages),
        }), flush=True)
        if provider_status == 429:
            # Tell the caller the model is busy (not broken), so it can ask the user to retry shortly.
            raise HTTPException(status_code=429, detail="akif_model_rate_limited") from exc
        raise HTTPException(status_code=502, detail="akif_model_request_failed") from exc
    if not content.strip():
        raise HTTPException(status_code=502, detail="akif_model_empty_response")
    return {"model": gateway["model"],
            "choices": [{"message": {"role": "assistant", "content": content}}]}

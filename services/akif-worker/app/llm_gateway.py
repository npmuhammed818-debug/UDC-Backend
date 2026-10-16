import os
from typing import Any


def _configuration() -> tuple[str | None, str | None]:
    model = os.getenv("AKIF_LLM_MODEL", "").strip() or None
    if model and model.startswith("groq/") and not os.getenv("GROQ_API_KEY"):
        return model, "GROQ_API_KEY"
    if model and model.startswith("gemini/"):
        if not os.getenv("GEMINI_API_KEY"):
            return model, "GEMINI_API_KEY"
        # Free Gemini terms permit product-improvement use. Explicit operator opt-in.
        if os.getenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED") != "true":
            return model, "AKIF_GEMINI_DATA_PROCESSING_ACCEPTED"
    return model, None


def status() -> dict[str, Any]:
    try:
        import litellm  # noqa: F401

        installed = True
    except ImportError:
        installed = False

    model, missing = _configuration()
    return {
        "installed": installed,
        "configured": bool(installed and model and not missing),
        "model": model if installed and model else None,
        "provider_neutral": True,
        "missing_configuration": missing,
        "automatic_provider_fallback": False,
    }


def complete(messages: list[dict[str, str]]) -> str:
    model, missing = _configuration()
    if not model:
        raise RuntimeError("AKIF_LLM_MODEL is not configured")
    if missing:
        raise RuntimeError(f"Missing configuration: {missing}")

    try:
        from litellm import completion
    except ImportError as exc:
        raise RuntimeError("LiteLLM optional dependency is not installed") from exc

    response = completion(model=model, messages=messages, timeout=20, max_retries=0,
                          max_tokens=2048)
    content = response.choices[0].message.content
    if not isinstance(content, str):
        raise RuntimeError("LLM returned no text content")
    return content

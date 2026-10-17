import os
import sys
from importlib.util import find_spec
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
        # Configuration checks must not import the SDK or fetch its remote model map.
        installed = sys.modules.get("litellm") is not None or find_spec("litellm") is not None
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


def complete(messages: list[dict[str, str]], timeout_seconds: float = 20) -> str:
    model, missing = _configuration()
    if not model:
        raise RuntimeError("AKIF_LLM_MODEL is not configured")
    if missing:
        raise RuntimeError(f"Missing configuration: {missing}")

    try:
        from litellm import completion
    except ImportError as exc:
        raise RuntimeError("LiteLLM dependency is not installed") from exc

    response = completion(model=model, messages=messages, timeout=max(1, min(20, timeout_seconds)), max_retries=0,
                          max_tokens=2048)
    content = response.choices[0].message.content
    if not isinstance(content, str):
        raise RuntimeError("LLM returned no text content")
    return content


def probe() -> dict[str, Any]:
    """One fixed public prompt; never log secrets, model text, or exception messages."""
    gateway = status()
    result = {"model": gateway["model"], "configured": gateway["configured"]}
    if not gateway["configured"]:
        return {**result, "status": "not_configured",
                "missing_configuration": gateway["missing_configuration"]}
    try:
        answer = complete([{"role": "user", "content": "Reply only with AKIF_READY."}],
                          timeout_seconds=10)
        return {**result, "status": "passed" if answer.strip() else "empty_response"}
    except Exception as exc:
        return {**result, "status": "failed", "error_type": type(exc).__name__}

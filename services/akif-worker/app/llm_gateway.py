import json
import os
import sys
from importlib.util import find_spec
from importlib import import_module
from typing import Any


def initialize_sdk() -> None:
    """Load the SDK on the server startup thread before request logging starts."""
    os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
    import_module("litellm")


import time

_sleep = time.sleep
MAX_ATTEMPTS_PER_PROVIDER = 2
RETRY_BACKOFF_SECONDS = 0.4


def _models() -> list[str]:
    """Primary model first, then the optional backup. Only these are ever called."""
    out: list[str] = []
    for name in ("AKIF_LLM_MODEL", "AKIF_LLM_BACKUP_MODEL"):
        value = os.getenv(name, "").strip()
        if value and value not in out:
            out.append(value)
    return out


def _missing_for(model: str, sensitivity: str) -> str | None:
    """What stops this model from serving this kind of content, or None when it may.

    Gemini (free tier) may use content to improve Google products, so private/deal content only
    goes there after the operator's explicit opt-in. Generic chat may use it without the opt-in.
    A model that is refused here is skipped, never used as a fallback.
    """
    if model.startswith("groq/") and not os.getenv("GROQ_API_KEY"):
        return "GROQ_API_KEY"
    if model.startswith("gemini/"):
        if not os.getenv("GEMINI_API_KEY"):
            return "GEMINI_API_KEY"
        if sensitivity != "generic" and os.getenv("AKIF_GEMINI_DATA_PROCESSING_ACCEPTED") != "true":
            return "AKIF_GEMINI_DATA_PROCESSING_ACCEPTED"
    return None


def _configuration(sensitivity: str = "private") -> tuple[str | None, str | None]:
    """Primary model and why it cannot serve this content (kept for callers and tests)."""
    models = _models()
    if not models:
        return None, None
    return models[0], _missing_for(models[0], sensitivity)


def _eligible(sensitivity: str) -> tuple[list[str], str | None]:
    models = _models()
    usable, first_missing = [], None
    for model in models:
        missing = _missing_for(model, sensitivity)
        if missing is None:
            usable.append(model)
        elif first_missing is None:
            first_missing = missing
    return usable, first_missing


def status() -> dict[str, Any]:
    try:
        # Configuration checks must not import the SDK or fetch its remote model map.
        installed = sys.modules.get("litellm") is not None or find_spec("litellm") is not None
    except ImportError:
        installed = False

    models = _models()
    model, missing = _configuration("private")
    private_usable, _ = _eligible("private")
    generic_usable, generic_missing = _eligible("generic")
    # Configured means at least generic chat can be answered; private content has its own list.
    return {
        "installed": installed,
        "configured": bool(installed and generic_usable),
        "model": model if installed and model else None,
        "backup_model": models[1] if len(models) > 1 else None,
        "provider_neutral": True,
        "missing_configuration": missing if not generic_usable else None,
        "private_content_providers": len(private_usable),
        "generic_content_providers": len(generic_usable),
        "automatic_provider_fallback": len(generic_usable) > 1 or len(private_usable) > 1,
    }


def _call_provider(completion, model: str, messages: list[dict[str, str]], deadline: float) -> str:
    last: Exception | None = None
    for attempt in range(MAX_ATTEMPTS_PER_PROVIDER):
        remaining = deadline - time.monotonic()
        if remaining < 1:
            break
        try:
            response = completion(model=model, messages=messages, timeout=max(1, min(20, remaining)),
                                  max_retries=0, max_tokens=2048)
            content = response.choices[0].message.content
            if not isinstance(content, str) or not content.strip():
                raise RuntimeError("LLM returned no text content")
            return content
        except Exception as exc:  # error, timeout or 429: retry once, then the caller fails over
            last = exc
            if attempt + 1 < MAX_ATTEMPTS_PER_PROVIDER:
                _sleep(RETRY_BACKOFF_SECONDS)
    raise last or TimeoutError("llm_deadline_exhausted")


def complete(messages: list[dict[str, str]], timeout_seconds: float = 20, sensitivity: str = "private") -> str:
    """sensitivity: "private" (default, deal/account/user content) or "generic" (public knowledge only)."""
    if sensitivity not in ("private", "generic"):
        sensitivity = "private"
    models = _models()
    if not models:
        raise RuntimeError("AKIF_LLM_MODEL is not configured")
    usable, missing = _eligible(sensitivity)
    if not usable:
        raise RuntimeError(f"Missing configuration: {missing}")

    try:
        from litellm import completion
    except ImportError as exc:
        raise RuntimeError("LiteLLM dependency is not installed") from exc

    # One overall deadline, shared by every provider tried, so failover never extends the wait.
    deadline = time.monotonic() + max(1, min(20, timeout_seconds))
    last: Exception | None = None
    for model in usable:
        try:
            return _call_provider(completion, model, messages, deadline)
        except Exception as exc:
            last = exc
            print("AKIF provider failed, trying next if any: " + json.dumps({
                "provider": model.split("/", 1)[0], "error_type": type(exc).__name__,
                "http_status": getattr(exc, "status_code", None) if type(getattr(exc, "status_code", None)) is int else None,
            }), flush=True)
    assert last is not None
    raise last


def probe() -> dict[str, Any]:
    """One fixed public prompt; never log secrets, model text, or exception messages."""
    gateway = status()
    result = {"model": gateway["model"], "configured": gateway["configured"]}
    if not gateway["configured"]:
        return {**result, "status": "not_configured",
                "missing_configuration": gateway["missing_configuration"]}
    try:
        answer = complete([{"role": "user", "content": "Reply only with AKIF_READY."}],
                          timeout_seconds=10, sensitivity="generic")
        return {**result, "status": "passed" if answer.strip() else "empty_response"}
    except Exception as exc:
        return {**result, "status": "failed", "error_type": type(exc).__name__}

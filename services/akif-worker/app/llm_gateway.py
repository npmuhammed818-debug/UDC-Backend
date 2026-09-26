import os
from typing import Any


def status() -> dict[str, Any]:
    try:
        import litellm  # noqa: F401

        installed = True
    except ImportError:
        installed = False

    model = os.getenv("AKIF_LLM_MODEL")
    return {
        "installed": installed,
        "configured": bool(installed and model),
        "model": model if installed and model else None,
        "provider_neutral": True,
    }


def complete(messages: list[dict[str, str]]) -> str:
    model = os.getenv("AKIF_LLM_MODEL")
    if not model:
        raise RuntimeError("AKIF_LLM_MODEL is not configured")

    try:
        from litellm import completion
    except ImportError as exc:
        raise RuntimeError("LiteLLM optional dependency is not installed") from exc

    response = completion(model=model, messages=messages)
    content = response.choices[0].message.content
    if not isinstance(content, str):
        raise RuntimeError("LLM returned no text content")
    return content

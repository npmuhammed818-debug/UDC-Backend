from fastapi import HTTPException

from app import reasoning


def _configured_model():
    return {"configured": True, "model": "test/provider-model"}


def test_single_mode_keeps_one_completion(monkeypatch):
    calls = []
    monkeypatch.setattr(reasoning, "llm_status", _configured_model)
    monkeypatch.setattr(
        reasoning,
        "complete",
        lambda messages: calls.append(messages) or "single answer",
    )

    result = reasoning.reason(
        reasoning.ReasoningRequest(
            task="trade_question",
            prompt="Explain CIF",
            context={"source": "approved glossary"},
        )
    )

    assert len(calls) == 1
    assert result.answer == "single answer"
    assert result.mode == "single"
    assert result.specialist_review is None
    assert result.human_review_required is False


def test_specialist_review_runs_evidence_risk_then_coordinator(monkeypatch):
    calls = []

    def fake_complete(messages):
        calls.append(messages)
        return f"role output {len(calls)}"

    monkeypatch.setattr(reasoning, "llm_status", _configured_model)
    monkeypatch.setattr(reasoning, "complete", fake_complete)

    result = reasoning.reason(
        reasoning.ReasoningRequest(
            task="company_analysis",
            prompt="Review the supplied company details",
            context={"registry_result": "not supplied"},
            mode="specialist_review",
        )
    )

    assert len(calls) == 3
    assert "evidence analyst" in calls[0][0]["content"].lower()
    assert "risk reviewer" in calls[1][0]["content"].lower()
    assert "coordinator" in calls[2][0]["content"].lower()
    assert "role output 1" in calls[1][1]["content"]
    assert "role output 2" in calls[2][1]["content"]
    assert result.answer == "role output 3"
    assert result.specialist_review is not None
    assert result.specialist_review.evidence_analyst == "role output 1"
    assert result.specialist_review.risk_reviewer == "role output 2"
    assert result.human_review_required is True
    assert any("same configured model" in warning for warning in result.warnings)


def test_unconfigured_model_fails_before_any_completion(monkeypatch):
    calls = []
    monkeypatch.setattr(
        reasoning,
        "llm_status",
        lambda: {"configured": False, "model": None},
    )
    monkeypatch.setattr(
        reasoning,
        "complete",
        lambda messages: calls.append(messages) or "unexpected",
    )

    try:
        reasoning.reason(
            reasoning.ReasoningRequest(
                task="trade_question",
                prompt="Explain CIF",
                mode="specialist_review",
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 503
        assert exc.detail == "akif_llm_not_configured"
    else:
        raise AssertionError("Expected missing-model configuration to be rejected")

    assert calls == []

from typing import Literal

from pydantic import BaseModel, Field


class VerificationSignals(BaseModel):
    registration_confirmed: bool | None = None
    domain_matches_company: bool | None = None
    contact_matches_domain: bool | None = None
    trade_history_found: bool | None = None
    documents_consistent: bool | None = None
    address_consistent: bool | None = None
    sanctions_hit: bool | None = None
    adverse_media_found: bool | None = None
    source_count: int = Field(default=0, ge=0, le=1000)


class VerificationAssessment(BaseModel):
    confidence_score: int = Field(ge=0, le=100)
    risk_level: Literal["low", "medium", "high"]
    human_review_required: bool = True
    positive_signals: list[str]
    warnings: list[str]
    next_checks: list[str]
    status: Literal["research_only"] = "research_only"


def assess_verification(signals: VerificationSignals) -> VerificationAssessment:
    score = 20
    positive: list[str] = []
    warnings: list[str] = []
    next_checks: list[str] = []

    weighted = [
        ("registration_confirmed", 20, "Registration was confirmed against a source"),
        ("domain_matches_company", 10, "Company domain is consistent with the claimed identity"),
        ("contact_matches_domain", 10, "Contact information is consistent with the company domain"),
        ("trade_history_found", 15, "Relevant trade-history evidence was found"),
        ("documents_consistent", 15, "Submitted documents are internally consistent"),
        ("address_consistent", 10, "Address information is consistent across sources"),
    ]
    for field, weight, message in weighted:
        value = getattr(signals, field)
        if value is True:
            score += weight
            positive.append(message)
        elif value is False:
            score -= max(5, weight // 2)
            warnings.append(message.replace(" is ", " is not ").replace(" was ", " was not "))

    if signals.source_count >= 3:
        score += 5
        positive.append("Multiple independent evidence sources are available")
    else:
        next_checks.append("Collect evidence from multiple independent sources")

    if signals.sanctions_hit is True:
        score -= 60
        warnings.append("A sanctions-list match or possible match requires immediate compliance review")
    elif signals.sanctions_hit is None:
        next_checks.append("Run an authorized sanctions/compliance screening")

    if signals.adverse_media_found is True:
        score -= 20
        warnings.append("Adverse-media evidence requires human review")
    elif signals.adverse_media_found is None:
        next_checks.append("Check reputable adverse-media sources where legally appropriate")

    if signals.registration_confirmed is not True:
        next_checks.append("Confirm company registration with an authoritative registry")
    if signals.documents_consistent is not True:
        next_checks.append("Compare submitted documents against the agreed trade terms")

    score = max(0, min(100, score))
    risk = "high" if signals.sanctions_hit or score < 40 else "medium" if score < 70 else "low"

    return VerificationAssessment(
        confidence_score=score,
        risk_level=risk,
        positive_signals=positive,
        warnings=warnings,
        next_checks=list(dict.fromkeys(next_checks)),
    )

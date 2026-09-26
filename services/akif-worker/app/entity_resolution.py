from __future__ import annotations

from itertools import combinations
from urllib.parse import urlparse

import pandas as pd
from rapidfuzz.fuzz import ratio

from .models import EntityDedupeRequest, EntityDedupeResponse, EntityLink, EntityRecord


def _norm(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.lower().replace(",", " ").replace(".", " ").split())


def _host(record: EntityRecord) -> str:
    if record.website is None:
        return ""
    host = urlparse(str(record.website)).hostname or ""
    return host.removeprefix("www.").lower()


def _pair_score(left: EntityRecord, right: EntityRecord) -> tuple[float, list[str]]:
    reasons: list[str] = []
    name_score = ratio(_norm(left.name), _norm(right.name)) / 100

    weights: list[tuple[float, float]] = [(name_score, 0.55)]
    if name_score >= 0.9:
        reasons.append("company names are highly similar")

    for label, lv, rv, weight in [
        ("country", _norm(left.country), _norm(right.country), 0.10),
        ("website", _host(left), _host(right), 0.15),
        ("email", _norm(left.email), _norm(right.email), 0.10),
        ("phone", _norm(left.phone), _norm(right.phone), 0.10),
    ]:
        if not lv or not rv:
            continue
        exact = 1.0 if lv == rv else 0.0
        weights.append((exact, weight))
        if exact:
            reasons.append(f"{label} matches exactly")

    total_weight = sum(weight for _, weight in weights)
    score = sum(value * weight for value, weight in weights) / total_weight
    return score, reasons


def _rapidfuzz_links(request: EntityDedupeRequest) -> EntityDedupeResponse:
    links: list[EntityLink] = []
    for left, right in combinations(request.records, 2):
        score, reasons = _pair_score(left, right)
        if score >= request.threshold:
            links.append(
                EntityLink(
                    left_id=left.id,
                    right_id=right.id,
                    score=round(score, 4),
                    method="rapidfuzz",
                    reasons=reasons or ["combined company-field similarity"],
                )
            )

    return EntityDedupeResponse(
        links=sorted(links, key=lambda item: item.score, reverse=True),
        method="rapidfuzz",
        warnings=[
            "Fallback matcher used. AKIF should treat these as candidate duplicates, not verified identities."
        ],
    )


def _splink_links(request: EntityDedupeRequest) -> EntityDedupeResponse:
    import splink.comparison_library as cl
    from splink import DuckDBAPI, Linker, SettingsCreator, block_on

    rows = []
    for record in request.records:
        rows.append(
            {
                "unique_id": record.id,
                "name": _norm(record.name),
                "country": _norm(record.country),
                "website": _host(record),
                "email": _norm(record.email),
                "phone": _norm(record.phone),
            }
        )

    df = pd.DataFrame(rows)
    settings = SettingsCreator(
        link_type="dedupe_only",
        comparisons=[
            cl.JaroWinklerAtThresholds("name", [0.95, 0.88, 0.75]),
            cl.ExactMatch("country"),
            cl.ExactMatch("website"),
            cl.EmailComparison("email"),
            cl.ExactMatch("phone"),
        ],
        blocking_rules_to_generate_predictions=[
            block_on("country"),
            block_on("website"),
            block_on("email"),
            block_on("phone"),
        ],
    )

    linker = Linker(df, settings, DuckDBAPI())
    linker.training.estimate_u_using_random_sampling(max_pairs=min(1_000_000, len(df) ** 2 * 10))
    for rule in [block_on("country"), block_on("website")]:
        try:
            linker.training.estimate_parameters_using_expectation_maximisation(rule)
        except Exception:
            continue

    predictions = linker.inference.predict(threshold_match_probability=request.threshold)
    result = predictions.as_pandas_dataframe()

    links: list[EntityLink] = []
    for row in result.to_dict(orient="records"):
        probability = float(row.get("match_probability", 0.0))
        if probability < request.threshold:
            continue
        links.append(
            EntityLink(
                left_id=str(row["unique_id_l"]),
                right_id=str(row["unique_id_r"]),
                score=round(probability, 4),
                method="splink",
                reasons=["probabilistic multi-field entity match"],
            )
        )

    return EntityDedupeResponse(
        links=sorted(links, key=lambda item: item.score, reverse=True),
        method="splink",
        warnings=[
            "Entity links are probabilistic candidates and require evidence review before merging records."
        ],
    )


def dedupe_entities(request: EntityDedupeRequest) -> EntityDedupeResponse:
    if len(request.records) < 20:
        return _rapidfuzz_links(request)

    try:
        return _splink_links(request)
    except Exception:
        response = _rapidfuzz_links(request)
        response.warnings.append(
            "Splink could not estimate a stable model for this batch; AKIF used the deterministic fallback."
        )
        return response

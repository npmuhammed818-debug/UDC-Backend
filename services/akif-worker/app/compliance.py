from __future__ import annotations

import csv
import io
import time
from dataclasses import dataclass
from urllib.request import Request, urlopen

from fastapi import HTTPException
from pydantic import BaseModel, Field
from rapidfuzz.fuzz import ratio


OFAC_BASE = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports"
USER_AGENT = "UDC-AKIF/1.0 (official-source compliance research)"
CACHE_TTL_SECONDS = 60 * 60


class OfacScreenRequest(BaseModel):
    name: str = Field(min_length=2, max_length=300)
    threshold: float = Field(default=90, ge=50, le=100)
    limit: int = Field(default=20, ge=1, le=100)


class OfacPossibleMatch(BaseModel):
    entry_id: str
    name: str
    list_name: str
    name_type: str
    score: float


class OfacScreenResponse(BaseModel):
    provider: str = "ofac"
    query: str
    possible_matches: list[OfacPossibleMatch]
    human_review_required: bool = True
    no_match_is_clearance: bool = False
    warnings: list[str]


@dataclass
class _OfacName:
    entry_id: str
    name: str
    list_name: str
    name_type: str


_cache: tuple[float, list[_OfacName]] | None = None


def _download_csv(filename: str) -> list[list[str]]:
    url = f"{OFAC_BASE}/{filename}"
    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=30) as response:
            text = response.read().decode("utf-8-sig", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=502, detail="ofac_download_failed") from exc
    return list(csv.reader(io.StringIO(text)))


def _safe(row: list[str], index: int) -> str:
    if index >= len(row):
        return ""
    return row[index].strip()


def _load_names() -> list[_OfacName]:
    global _cache
    now = time.monotonic()
    if _cache and now - _cache[0] < CACHE_TTL_SECONDS:
        return _cache[1]

    names: list[_OfacName] = []

    # Legacy flat files remain officially supported by OFAC. Primary and
    # alias files are both loaded so name screening does not ignore aliases.
    for filename, list_name in [
        ("SDN.CSV", "SDN"),
        ("CONS_PRIM.CSV", "NON_SDN"),
    ]:
        for row in _download_csv(filename):
            entry_id = _safe(row, 0)
            name = _safe(row, 1)
            if entry_id and name:
                names.append(
                    _OfacName(
                        entry_id=entry_id,
                        name=name,
                        list_name=list_name,
                        name_type="primary",
                    )
                )

    for filename, list_name in [
        ("ALT.CSV", "SDN"),
        ("CONS_ALT.CSV", "NON_SDN"),
    ]:
        for row in _download_csv(filename):
            entry_id = _safe(row, 0)
            alias_name = _safe(row, 3)
            if entry_id and alias_name:
                names.append(
                    _OfacName(
                        entry_id=entry_id,
                        name=alias_name,
                        list_name=list_name,
                        name_type="alias",
                    )
                )

    _cache = (now, names)
    return names


def _normalize(value: str) -> str:
    return " ".join(value.casefold().replace(",", " ").replace(".", " ").split())


def screen_ofac(request: OfacScreenRequest) -> OfacScreenResponse:
    query = _normalize(request.name)
    matches: list[OfacPossibleMatch] = []

    for candidate in _load_names():
        score = ratio(query, _normalize(candidate.name))
        if score < request.threshold:
            continue
        matches.append(
            OfacPossibleMatch(
                entry_id=candidate.entry_id,
                name=candidate.name,
                list_name=candidate.list_name,
                name_type=candidate.name_type,
                score=round(float(score), 2),
            )
        )

    matches.sort(key=lambda item: item.score, reverse=True)

    return OfacScreenResponse(
        query=request.name,
        possible_matches=matches[: request.limit],
        warnings=[
            "This endpoint screens official U.S. OFAC lists only; it is not a complete global sanctions program.",
            "Fuzzy name matches can be false positives and require authorized human compliance review.",
            "No returned match must not be interpreted as sanctions clearance.",
            "Additional identifiers such as address, date of birth, registration number and ownership should be checked before any compliance conclusion.",
        ],
    )

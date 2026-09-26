from __future__ import annotations

import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException
from pydantic import BaseModel, Field


GLEIF_BASE = "https://api.gleif.org/api/v1/lei-records"
USER_AGENT = "UDC-AKIF/1.0 (official-source identity research)"


class GleifCompanySearchRequest(BaseModel):
    name: str = Field(min_length=2, max_length=300)
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    limit: int = Field(default=10, ge=1, le=50)


class GleifCompanyCandidate(BaseModel):
    lei: str
    legal_name: str
    entity_status: str | None = None
    registration_status: str | None = None
    jurisdiction: str | None = None
    legal_address_country: str | None = None
    headquarters_country: str | None = None
    next_renewal_date: str | None = None
    source_url: str


class GleifCompanySearchResponse(BaseModel):
    provider: str = "gleif"
    query: str
    candidates: list[GleifCompanyCandidate]
    warnings: list[str]


def _get_json(url: str) -> dict:
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/vnd.api+json, application/json",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=502, detail="gleif_request_failed") from exc


def _country(record: dict, field: str) -> str | None:
    value = record.get(field)
    if not isinstance(value, dict):
        return None
    country = value.get("country")
    return str(country) if country else None


def search_gleif(request: GleifCompanySearchRequest) -> GleifCompanySearchResponse:
    params = {
        "filter[entity.legalName]": request.name,
        "page[size]": request.limit,
    }
    source_url = f"{GLEIF_BASE}?{urlencode(params)}"
    payload = _get_json(source_url)
    data = payload.get("data")
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="gleif_invalid_response")

    wanted_country = request.country_code.upper() if request.country_code else None
    candidates: list[GleifCompanyCandidate] = []

    for row in data:
        if not isinstance(row, dict):
            continue
        attributes = row.get("attributes")
        if not isinstance(attributes, dict):
            continue
        entity = attributes.get("entity")
        registration = attributes.get("registration")
        if not isinstance(entity, dict):
            continue
        if not isinstance(registration, dict):
            registration = {}

        legal_name_raw = entity.get("legalName")
        legal_name = (
            legal_name_raw.get("name")
            if isinstance(legal_name_raw, dict)
            else legal_name_raw
        )
        if not legal_name:
            continue

        legal_country = _country(entity, "legalAddress")
        headquarters_country = _country(entity, "headquartersAddress")
        if wanted_country and wanted_country not in {
            legal_country,
            headquarters_country,
        }:
            continue

        lei = row.get("id") or attributes.get("lei")
        if not lei:
            continue

        candidates.append(
            GleifCompanyCandidate(
                lei=str(lei),
                legal_name=str(legal_name),
                entity_status=(
                    str(entity.get("status")) if entity.get("status") else None
                ),
                registration_status=(
                    str(registration.get("status"))
                    if registration.get("status")
                    else None
                ),
                jurisdiction=(
                    str(entity.get("jurisdiction"))
                    if entity.get("jurisdiction")
                    else None
                ),
                legal_address_country=legal_country,
                headquarters_country=headquarters_country,
                next_renewal_date=(
                    str(registration.get("nextRenewalDate"))
                    if registration.get("nextRenewalDate")
                    else None
                ),
                source_url=f"{GLEIF_BASE}/{lei}",
            )
        )

    return GleifCompanySearchResponse(
        query=request.name,
        candidates=candidates,
        warnings=[
            "GLEIF identifies legal entities with LEIs; not every company has an LEI.",
            "An LEI record supports identity research but is not by itself UDC verification or proof of trade activity.",
            "Do not imply GLEIF endorsement of UDC or AKIF.",
        ],
    )

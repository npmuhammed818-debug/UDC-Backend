from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class EntityRecord(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=300)
    country: str | None = Field(default=None, max_length=120)
    website: HttpUrl | None = None
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=80)


class EntityDedupeRequest(BaseModel):
    records: list[EntityRecord] = Field(min_length=2, max_length=500)
    threshold: float = Field(default=0.88, ge=0.5, le=1.0)


class EntityLink(BaseModel):
    left_id: str
    right_id: str
    score: float = Field(ge=0, le=1)
    method: Literal["splink", "rapidfuzz"]
    reasons: list[str]


class EntityDedupeResponse(BaseModel):
    links: list[EntityLink]
    method: Literal["splink", "rapidfuzz"]
    warnings: list[str] = Field(default_factory=list)


class DocumentExtractionResponse(BaseModel):
    filename: str
    markdown: str
    character_count: int
    parser: Literal["docling"] = "docling"


class ComtradePreviewRequest(BaseModel):
    period: str = Field(min_length=4, max_length=100)
    reporter_code: str = Field(min_length=1, max_length=50)
    cmd_code: str = Field(min_length=1, max_length=200)
    flow_code: str = Field(min_length=1, max_length=20)
    partner_code: str | None = Field(default=None, max_length=50)
    partner2_code: str | None = Field(default=None, max_length=50)
    customs_code: str | None = Field(default=None, max_length=50)
    mot_code: str | None = Field(default=None, max_length=50)
    frequency: Literal["A", "M"] = "A"
    classification: str = Field(default="HS", min_length=1, max_length=20)
    max_records: int = Field(default=100, ge=1, le=500)


class ComtradePreviewResponse(BaseModel):
    provider: Literal["un_comtrade"] = "un_comtrade"
    retrieved_at: str
    source_url: str
    query: dict
    records: list[dict]

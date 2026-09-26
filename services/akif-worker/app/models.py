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
    warnings: list[str] = []


class DocumentExtractionResponse(BaseModel):
    filename: str
    markdown: str
    character_count: int
    parser: Literal["docling"] = "docling"

from collections import defaultdict
from typing import Any

from pydantic import BaseModel, Field


class MarketAnalysisRequest(BaseModel):
    records: list[dict[str, Any]] = Field(min_length=1, max_length=5000)


class MarketPeriod(BaseModel):
    period: str
    trade_value: float
    net_weight: float


class MarketAnalysisResponse(BaseModel):
    record_count: int
    total_trade_value: float
    total_net_weight: float
    periods: list[MarketPeriod]
    trend: str
    concentration: dict[str, float | str | None]
    warnings: list[str]


def _number(record: dict[str, Any], names: list[str]) -> float:
    for name in names:
        value = record.get(name)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return 0.0


def _text(record: dict[str, Any], names: list[str]) -> str | None:
    for name in names:
        value = record.get(name)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def analyze_market(request: MarketAnalysisRequest) -> MarketAnalysisResponse:
    by_period: dict[str, dict[str, float]] = defaultdict(lambda: {"value": 0.0, "weight": 0.0})
    by_partner: dict[str, float] = defaultdict(float)
    total_value = 0.0
    total_weight = 0.0

    for row in request.records:
        value = _number(row, ["primaryValue", "TradeValue", "tradeValue", "cifvalue", "fobvalue"])
        weight = _number(row, ["netWgt", "NetWeight", "netWeight", "qty"])
        period = _text(row, ["period", "Period", "refPeriodId", "year"]) or "unknown"
        partner = _text(row, ["partnerDesc", "PartnerDesc", "partner", "partnerCode"]) or "unknown"

        total_value += value
        total_weight += weight
        by_period[period]["value"] += value
        by_period[period]["weight"] += weight
        by_partner[partner] += value

    periods = [
        MarketPeriod(period=period, trade_value=round(values["value"], 2), net_weight=round(values["weight"], 3))
        for period, values in sorted(by_period.items(), key=lambda item: item[0])
    ]

    trend = "insufficient_data"
    known_periods = [p for p in periods if p.period != "unknown"]
    if len(known_periods) >= 2:
        first = known_periods[0].trade_value
        last = known_periods[-1].trade_value
        if first == 0 and last > 0:
            trend = "increasing"
        elif first > 0:
            change = (last - first) / first
            trend = "increasing" if change > 0.1 else "decreasing" if change < -0.1 else "stable"

    top_partner = None
    top_share = None
    if total_value > 0 and by_partner:
        top_partner, top_value = max(by_partner.items(), key=lambda item: item[1])
        top_share = round(top_value / total_value * 100, 2)

    warnings = []
    if total_value <= 0:
        warnings.append("No usable trade-value field was found in the supplied records.")
    if total_weight <= 0:
        warnings.append("No usable net-weight field was found in the supplied records.")
    warnings.append("Aggregate trade statistics show market flows; they do not identify or verify individual buyers or sellers.")

    return MarketAnalysisResponse(
        record_count=len(request.records),
        total_trade_value=round(total_value, 2),
        total_net_weight=round(total_weight, 3),
        periods=periods,
        trend=trend,
        concentration={"top_partner": top_partner, "top_partner_share_percent": top_share},
        warnings=warnings,
    )

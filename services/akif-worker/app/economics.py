from pydantic import BaseModel, Field, model_validator


class LandedCostRequest(BaseModel):
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    freight_total: float = Field(default=0, ge=0)
    insurance_total: float = Field(default=0, ge=0)
    inspection_total: float = Field(default=0, ge=0)
    handling_total: float = Field(default=0, ge=0)
    other_total: float = Field(default=0, ge=0)
    duty_rate_percent: float = Field(default=0, ge=0, le=1000)
    tax_rate_percent: float = Field(default=0, ge=0, le=1000)
    target_sale_price_per_unit: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def normalize_currency(self):
        self.currency = self.currency.upper()
        return self


class LandedCostResponse(BaseModel):
    currency: str
    goods_value: float
    cif_like_base: float
    duty_amount: float
    tax_amount: float
    landed_total: float
    landed_per_unit: float
    gross_margin_total: float | None = None
    gross_margin_percent: float | None = None
    assumptions: list[str]


def calculate_landed_cost(request: LandedCostRequest) -> LandedCostResponse:
    goods_value = request.quantity * request.unit_price
    cif_like_base = goods_value + request.freight_total + request.insurance_total
    duty_amount = cif_like_base * request.duty_rate_percent / 100
    taxable_base = cif_like_base + duty_amount
    tax_amount = taxable_base * request.tax_rate_percent / 100
    landed_total = (
        taxable_base
        + tax_amount
        + request.inspection_total
        + request.handling_total
        + request.other_total
    )
    landed_per_unit = landed_total / request.quantity

    gross_margin_total = None
    gross_margin_percent = None
    if request.target_sale_price_per_unit is not None:
        revenue = request.target_sale_price_per_unit * request.quantity
        gross_margin_total = revenue - landed_total
        gross_margin_percent = (gross_margin_total / revenue * 100) if revenue else None

    return LandedCostResponse(
        currency=request.currency,
        goods_value=round(goods_value, 2),
        cif_like_base=round(cif_like_base, 2),
        duty_amount=round(duty_amount, 2),
        tax_amount=round(tax_amount, 2),
        landed_total=round(landed_total, 2),
        landed_per_unit=round(landed_per_unit, 6),
        gross_margin_total=None if gross_margin_total is None else round(gross_margin_total, 2),
        gross_margin_percent=None if gross_margin_percent is None else round(gross_margin_percent, 2),
        assumptions=[
            "All monetary inputs are assumed to use the same currency; AKIF performs no FX conversion in this calculation.",
            "Duty is applied to goods + freight + insurance and tax to that base plus duty; local customs rules may differ.",
            "This is commercial decision support, not a customs or tax determination.",
        ],
    )

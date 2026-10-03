from app.document_compare import DocumentCompareRequest, DocumentText, compare_documents


def _finding(result, field):
    return next(finding for finding in result.findings if finding.field == field)


def test_matching_documents_report_consistent_trade_terms():
    result = compare_documents(
        DocumentCompareRequest(
            documents=[
                DocumentText(
                    label="LOI",
                    text="100 MT copper, USD 5,900/MT, CIF, DLC after SGS at destination.",
                ),
                DocumentText(
                    label="SPA",
                    text="100 MT copper, USD 5,900/MT, CIF, DLC after SGS at destination.",
                ),
            ]
        )
    )

    for field in ("incoterms", "payment_terms", "quantities", "prices"):
        finding = _finding(result, field)
        assert finding.status == "consistent"
        assert finding.values["LOI"] == finding.values["SPA"]

    assert any("human review" in warning.lower() for warning in result.warnings)


def test_conflicting_trade_terms_are_flagged():
    result = compare_documents(
        DocumentCompareRequest(
            documents=[
                DocumentText(
                    label="LOI",
                    text="100 MT copper, USD 5,900/MT, CIF, DLC after SGS.",
                ),
                DocumentText(
                    label="SPA",
                    text="120 MT copper, USD 6,000/MT, FOB, SBLC before loading.",
                ),
            ]
        )
    )

    for field in ("incoterms", "payment_terms", "quantities", "prices"):
        assert _finding(result, field).status == "different"


def test_payment_terms_do_not_match_inside_other_words():
    result = compare_documents(
        DocumentCompareRequest(
            documents=[
                DocumentText(
                    label="LOI",
                    text="Payment after settlement under DLC at destination.",
                ),
                DocumentText(
                    label="SPA",
                    text="Payment after settlement under DLC at destination.",
                ),
            ]
        )
    )

    assert _finding(result, "payment_terms").values == {
        "LOI": ["DLC"],
        "SPA": ["DLC"],
    }

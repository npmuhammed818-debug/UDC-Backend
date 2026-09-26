from app.entity_resolution import dedupe_entities
from app.models import EntityDedupeRequest, EntityRecord


def test_similar_company_records_are_linked():
    request = EntityDedupeRequest(
        records=[
            EntityRecord(
                id="a",
                name="Acme Trading LLC",
                country="United Arab Emirates",
                website="https://acme.example.com",
            ),
            EntityRecord(
                id="b",
                name="ACME Trading L.L.C.",
                country="United Arab Emirates",
                website="https://acme.example.com",
            ),
            EntityRecord(
                id="c",
                name="Different Export Company",
                country="India",
                website="https://different.example.com",
            ),
        ],
        threshold=0.8,
    )

    result = dedupe_entities(request)

    assert result.method == "rapidfuzz"
    assert any(
        {link.left_id, link.right_id} == {"a", "b"}
        for link in result.links
    )
    assert not any(
        {link.left_id, link.right_id} == {"a", "c"}
        for link in result.links
    )

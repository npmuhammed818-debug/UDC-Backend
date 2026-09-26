from pydantic import BaseModel, Field


class LearnRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=120)


class LearnResponse(BaseModel):
    topic: str
    explanation: str
    cautions: list[str]


_GLOSSARY = {
    "cif": "CIF means Cost, Insurance and Freight. Under Incoterms, the seller arranges and pays carriage and insurance to the named destination port, while risk transfers according to the applicable CIF rule.",
    "fob": "FOB means Free On Board. The seller delivers when the goods are on board the vessel at the named port of shipment; responsibilities and risk then shift according to the applicable Incoterms rule.",
    "dlc": "A Documentary Letter of Credit is a bank undertaking governed by its terms. Payment depends on compliant presentation of the documents specified in the credit, not simply on a platform status.",
    "sblc": "A Standby Letter of Credit is generally a secondary payment undertaking intended to be drawn when the applicant fails to meet an obligation, subject to the standby's exact terms.",
    "mt103": "MT103 is a SWIFT customer credit transfer message. Seeing an MT103 reference is not by itself proof that funds are irrevocably available to a recipient.",
    "sgs": "SGS is an inspection, testing and certification company. A transaction may use SGS or another inspection provider depending on agreed terms.",
    "icpo": "An ICPO is commonly used in commodity trading as a buyer purchase-order document. Its exact legal effect depends on jurisdiction, wording and surrounding agreements.",
    "fco": "An FCO is commonly used as a Full Corporate Offer describing proposed commercial terms. It should be checked against the buyer's requirement and any later contract.",
    "spa": "An SPA is a Sale and Purchase Agreement. The signed agreement should accurately reflect the final commercial, inspection, shipping and payment terms agreed by the parties.",
    "incoterms": "Incoterms are ICC trade terms allocating specified delivery tasks, costs and risks between seller and buyer. They do not by themselves determine ownership, payment method or every contract obligation.",
}


def explain_topic(request: LearnRequest) -> LearnResponse:
    key = request.topic.strip().lower()
    explanation = _GLOSSARY.get(
        key,
        "AKIF does not yet have a curated lesson for this topic. A model-backed explanation can be added later, but high-risk legal, customs and banking questions should be checked against authoritative sources.",
    )
    return LearnResponse(
        topic=request.topic.strip(),
        explanation=explanation,
        cautions=[
            "Educational guidance is not legal, banking, customs or tax advice.",
            "Transaction-specific documents and local rules can change the answer.",
        ],
    )

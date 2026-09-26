---
name: akif-trade-research
description: Research trade opportunities with provenance and human review
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [trade, research, akif, udc]
    category: research
---

# AKIF Trade Research

## When to Use

Use this skill when AKIF asks for a repeatable workflow to research demand, supply, products, countries, buyers, sellers, or trade opportunities.

## Procedure

1. Normalize the product description and identify candidate HS codes.
2. Mark HS codes as candidates until confirmed from an authoritative tariff source.
3. Prefer official or licensed trade-data sources and preserve source URLs, retrieval times, query parameters, and provider identity.
4. Separate aggregate market evidence from company-level evidence.
5. Never infer that a named company imported or exported a product from aggregate country-level statistics.
6. Resolve duplicate company identities before combining evidence.
7. Calculate commercial metrics only from explicit inputs and disclose assumptions.
8. Run verification/compliance checks as separate evidence steps.
9. Produce an explainable opportunity assessment with warnings and missing evidence.
10. Hand the result to UDC for administrator review before outreach, matching, or deal creation.

## Pitfalls

- A high trade value does not identify a buyer.
- Similar company names do not prove they are the same entity.
- A website or document does not prove legal registration or authenticity.
- A model-generated HS code is not a customs determination.
- Missing data must be reported, not filled with guesses.

## Verification

A research result is ready for UDC review only when its material claims can be traced to stored evidence and any inference is clearly labeled as inference.

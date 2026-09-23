---
name: UDC communication boundary
description: Product boundary between external WhatsApp communication and UDC trade execution.
---

Live counterparty communication belongs in WhatsApp, while UDC owns the verified trade record: counterparties, requirements, offers, negotiation notes, permissioned documents, and execution milestones.

**Why:** The product should solve the trust and execution work that a general messaging app cannot, without becoming a WhatsApp clone.

**How to apply:** Keep communication UI contextual to a deal and frame it as a handoff or negotiation record. Future WhatsApp/Meta work should plug into a provider-neutral adapter seam; do not add a fake connector or transport.
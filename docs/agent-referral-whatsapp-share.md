# Agent referral sharing — QA only (not deployed)

The WhatsApp agent **My code** action, available only to an approved/verified agent, now provides a ready-to-forward message with the exact syntax accepted by UDC:

`Referral UDC-0123456789AB`

The agent no longer needs to tell the recipient to type the word "Referral" separately. The agent receives a short instruction followed by the complete standalone copyable command. No automatic commission, deal/document access or referral approval is granted by sharing this text.

Optionally, UDC can send an additional tap-to-open WhatsApp shortcut using the official `https://wa.me/<number>?text=Referral%20UDC-...` format, but ONLY when `UDC_WHATSAPP_PUBLIC_NUMBER` has been deliberately configured to UDC's **real public dialable number** (country code plus number, 8–15 digits, optional initial `+`; e.g. `+15551234567` for local QA fixtures). Do **not** use `WHATSAPP_PHONE_NUMBER_ID`, which is a Meta Graph resource ID, not the public dialable number. No environment variable is changed by this PR.

**Recipient flow:** A buyer or seller first registers with UDC, agrees to the privacy policy, then sends the exact referral message to the official UDC WhatsApp number. UDC looks up the verified agent, asks the recipient to confirm whether the introduction is legitimate, and records a pending referral only after explicit recipient confirmation. Admin review is still required. An unregistered recipient is instructed to register before claiming the referral; **this PR does not persist or automatically attach an invitation sent before registration**. This is a known remaining UX limitation, not an implicitly finished feature.

**Tests:** mocked WhatsApp tests verify verified-only access, clean standalone referral commands, correctly encoded share link, no link when missing configuration, and the existing buyer/seller confirmation and attribution boundaries. Pure tests reject malformed mobile numbers, line breaks, extra URL parameters and invalid agent identifiers.

No staging/prod Meta sends, PR merges, provider subscriptions, migrations or secret changes were performed.

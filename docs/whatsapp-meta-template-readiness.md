# Meta WhatsApp templates: admin readiness check (draft QA)

This feature adds a mobile-friendly **read-only** Meta template-status check at `/admin/whatsapp-readiness`.

- Admin browser GET `/api/admin/whatsapp/readiness` reports only whether the backend has `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_BUSINESS_ACCOUNT_ID` configured; it makes **no provider request**.
- After the admin taps **Check approved templates**, POST `/api/admin/whatsapp/templates/check` uses a server-side **GET** of the WABA template list from `https://graph.facebook.com/v21.0/{WABA_ID}/message_templates?fields=name,language,category,status&limit=50`. It cannot create, edit, approve or send messages.
- An existing admin session is required, with a one-minute cooldown per admin. The Meta token is kept server-side and no template body, button URL, media asset, phone number, Graph error body, token or credentials are returned or logged.
- The UI shows template status, language and category, plus an **approved utility** count. It explicitly warns if Meta has more pages, so zero in the sampled page is not a claim that none exist.
- Bounded 96 KB streaming, a 10-second timeout, no redirects and safe coarse upstream failure reasons keep provider payloads out of responses.
- `productionReady` and `canSend` always remain **false**, even if approved templates exist. Template approval alone does **not** establish recipient consent, a valid notification category, registration, confirmed production number, usable language, webhook subscription or sending authorization.

This is a non-production diagnostic only, not a sender, a template-submission action or a production deployment. The prior #137 signed 24-hour window authorization also stays in isolated QA.

**Production gates:** official Meta WABA/phone number ownership, approved utility template(s) with reviewed customer-safe text and correct languages, test-recipient opt-in, signed Meta webhook test, connected authorized sender only with explicit owner approval, staging migration review for older MVP features, user testing, WhatsApp billing/quotas and outbound delivery receipts.

Source: Meta's WhatsApp Business Platform documentation and official template-list endpoint:
- https://www.postman.com/meta/whatsapp-business-platform/request/qtgr0i7/get-all-templates-default-fields
- https://whatsappbusiness.com/policy/

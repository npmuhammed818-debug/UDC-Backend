# Staging crisis first response

Staging-only (`UDC_APP_ENV=staging`). Text/captions receive a minimal text reply after signed inbound deduplication but before consent/trade/AI routing. Consented voice notes are checked after transcription and before chat/AI/trade work. No emergency monitoring, dispatch, diagnosis, crisis record or automatic notification is added. No real messages sent during testing.

Conservative English/Malayalam/common transliteration patterns cover explicit self-harm/suicide language, including method requests, passive death wishes and third-party concern. Response gives care, asks about immediate danger, points urgent risk to local emergency services/nearest emergency department, suggests trusted-person support and distance from dangerous objects, and states that AKIF cannot send help. No invented local hotline number. Educational or historical explicit mentions may also get this response. Indirect language and languages outside these patterns may be missed; this is a first safety net, not a full clinical classifier or tested crisis conversation.

Audio still requires successful transcription and existing consent; unknown/untranscribed audio cannot be classified. Attachment contents are not downloaded by the guard. Subsequent messages are evaluated independently; no stateful crisis follow-up is claimed. Native-speaker and professional review remain advisable before pilot/production.

Basis: WHO suicide questions and answers, accessed 4 November 2026: https://www.who.int/news-room/questions-and-answers/item/suicide .

Tests: pure-function phrase cases; real signed Express webhook with fixture DB/providers for text, Malayalam caption, transcribed Malayalam voice, invalid signature, no model/trade/upload calls. Not a live WhatsApp test or real storage test.

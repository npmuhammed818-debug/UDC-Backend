-- The 20261021 whatsapp_chat_sessions CHECK limited purpose to the native
-- form flows. The brain orchestrator (conversation layer, Nov 7-8) stores its
-- session and the durable menu-once lock under two more purposes; on staging
-- the legacy CHECK silently rejected every brain session save, so every turn
-- started with an empty history. Widen the CHECK.
BEGIN;
ALTER TABLE public.whatsapp_chat_sessions DROP CONSTRAINT IF EXISTS whatsapp_chat_sessions_purpose_check;
ALTER TABLE public.whatsapp_chat_sessions ADD CONSTRAINT whatsapp_chat_sessions_purpose_check
  CHECK (purpose IN ('profile_buyer','profile_seller','profile_agent','buyer','seller','brain_orchestrator','brain_menu_lock'));
COMMIT;

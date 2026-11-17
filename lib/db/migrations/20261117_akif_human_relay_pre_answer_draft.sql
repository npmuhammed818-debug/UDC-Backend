-- 17 Nov 2026: pre-claim draft snapshot. markAnswered stores the human reply
-- into draft, so after-the-fact answer==draft checks were circular. This
-- column preserves the draft as it stood before the first reply overwrite,
-- making relay-answer attribution comparisons meaningful again.
ALTER TABLE akif_human_relay_items ADD COLUMN IF NOT EXISTS pre_answer_draft text;

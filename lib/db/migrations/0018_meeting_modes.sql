BEGIN;

ALTER TABLE public.deal_meetings
  ADD COLUMN IF NOT EXISTS meeting_mode text NOT NULL DEFAULT 'virtual',
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS udc_representative_requested text NOT NULL DEFAULT 'false';

ALTER TABLE public.deal_meetings
  DROP CONSTRAINT IF EXISTS deal_meetings_mode_check;

ALTER TABLE public.deal_meetings
  ADD CONSTRAINT deal_meetings_mode_check
  CHECK (meeting_mode IN ('virtual', 'face_to_face'));

CREATE INDEX IF NOT EXISTS deal_meetings_mode_idx
  ON public.deal_meetings (meeting_mode);

COMMIT;

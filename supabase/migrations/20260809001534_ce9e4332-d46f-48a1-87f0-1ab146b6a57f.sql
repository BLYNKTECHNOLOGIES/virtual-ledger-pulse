ALTER TABLE public.hr_mail_messages
  ADD COLUMN IF NOT EXISTS in_reply_to text,
  ADD COLUMN IF NOT EXISTS references_header text,
  ADD COLUMN IF NOT EXISTS thread_key text;

CREATE OR REPLACE FUNCTION public.hr_mail_normalize_subject(p_subject text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    lower(
      btrim(
        regexp_replace(
          coalesce(p_subject, ''),
          '^((re|fw|fwd|aw|antwort)\s*(\[[0-9]+\])?\s*:\s*)+',
          '',
          'i'
        )
      )
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.hr_mail_set_thread_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_parent text;
  v_key text;
BEGIN
  IF NEW.thread_key IS NOT NULL AND NEW.thread_key <> '' THEN
    RETURN NEW;
  END IF;

  -- Prefer the referenced parent message: reuse its thread key when known.
  v_parent := NULLIF(btrim(coalesce(NEW.in_reply_to, '')), '');
  IF v_parent IS NULL AND NEW.references_header IS NOT NULL THEN
    v_parent := (regexp_match(NEW.references_header, '<[^<>]+>[^<>]*$'))[1];
    v_parent := (regexp_match(coalesce(NEW.references_header, ''), '(<[^<>]+>)\s*$'))[1];
  END IF;

  IF v_parent IS NOT NULL THEN
    SELECT thread_key INTO v_key
    FROM public.hr_mail_messages
    WHERE mailbox_id = NEW.mailbox_id AND message_id_header = v_parent
    LIMIT 1;

    IF v_key IS NULL THEN
      -- root of the thread is not stored yet: anchor on the parent id
      v_key := 'mid:' || v_parent;
    END IF;
  END IF;

  IF v_key IS NULL THEN
    v_ref := public.hr_mail_normalize_subject(NEW.subject);
    IF v_ref IS NULL THEN
      v_key := 'mid:' || coalesce(NULLIF(NEW.message_id_header, ''), NEW.id::text);
    ELSE
      v_key := 'subj:' || v_ref;
    END IF;
  END IF;

  NEW.thread_key := v_key;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_mail_set_thread_key ON public.hr_mail_messages;
CREATE TRIGGER trg_hr_mail_set_thread_key
BEFORE INSERT ON public.hr_mail_messages
FOR EACH ROW EXECUTE FUNCTION public.hr_mail_set_thread_key();

UPDATE public.hr_mail_messages
SET thread_key = CASE
  WHEN public.hr_mail_normalize_subject(subject) IS NULL
    THEN 'mid:' || coalesce(NULLIF(message_id_header, ''), id::text)
  ELSE 'subj:' || public.hr_mail_normalize_subject(subject)
END
WHERE thread_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_mail_messages_thread
  ON public.hr_mail_messages (mailbox_id, thread_key, received_at DESC);
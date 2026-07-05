ALTER TABLE public.copilot_exemplars ADD COLUMN IF NOT EXISTS exchange_account_id uuid;
CREATE INDEX IF NOT EXISTS idx_copilot_exemplars_account ON public.copilot_exemplars (exchange_account_id);

ALTER TABLE public.copilot_settings ADD COLUMN IF NOT EXISTS account_notes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.match_copilot_exemplars(
  query_embedding vector(1536),
  p_situation_class text,
  p_side text DEFAULT NULL,
  match_count integer DEFAULT 5,
  p_exchange_account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  situation_class text,
  side text,
  context_text text,
  reply_text text,
  language text,
  similarity double precision
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.situation_class, e.side, e.context_text, e.reply_text, e.language,
         CASE WHEN query_embedding IS NULL OR e.embedding IS NULL
              THEN 0::double precision
              ELSE 1 - (e.embedding <=> query_embedding) END AS similarity
  FROM public.copilot_exemplars e
  WHERE e.situation_class = p_situation_class
    AND (p_side IS NULL OR e.side IS NULL OR e.side = p_side)
    AND (p_exchange_account_id IS NULL OR e.exchange_account_id = p_exchange_account_id)
  ORDER BY
    CASE WHEN query_embedding IS NULL OR e.embedding IS NULL
         THEN 1 ELSE e.embedding <=> query_embedding END ASC,
    e.created_at DESC
  LIMIT match_count;
$$;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ copilot_settings (singleton) ============
CREATE TABLE public.copilot_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  operator_allowlist uuid[] NOT NULL DEFAULT '{}',
  trainer_allowlist uuid[] NOT NULL DEFAULT '{}',
  suggestion_count integer NOT NULL DEFAULT 3,
  auto_suggest boolean NOT NULL DEFAULT false,
  train_watermark timestamptz,
  exemplar_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_settings TO authenticated;
GRANT ALL ON public.copilot_settings TO service_role;

ALTER TABLE public.copilot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_select_copilot_settings ON public.copilot_settings
  FOR SELECT TO authenticated
  USING (verify_terminal_access((select auth.uid())));

CREATE POLICY terminal_write_copilot_settings ON public.copilot_settings
  FOR ALL TO authenticated
  USING (verify_terminal_access((select auth.uid())))
  WITH CHECK (verify_terminal_access((select auth.uid())));

CREATE POLICY service_all_copilot_settings ON public.copilot_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============ copilot_exemplars (service-role only) ============
CREATE TABLE public.copilot_exemplars (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  situation_class text NOT NULL,
  side text,
  context_text text,
  reply_text text NOT NULL,
  language text,
  order_meta jsonb NOT NULL DEFAULT '{}',
  source_operator uuid,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.copilot_exemplars TO service_role;

ALTER TABLE public.copilot_exemplars ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_all_copilot_exemplars ON public.copilot_exemplars
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_copilot_exemplars_class_side ON public.copilot_exemplars (situation_class, side);
CREATE INDEX idx_copilot_exemplars_reply_trgm ON public.copilot_exemplars USING gin (reply_text gin_trgm_ops);
CREATE INDEX idx_copilot_exemplars_embedding ON public.copilot_exemplars USING hnsw (embedding vector_cosine_ops);

-- ============ updated_at trigger for settings ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_copilot_settings_updated_at
  BEFORE UPDATE ON public.copilot_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ retrieval RPC (service-role invoked from edge fn) ============
CREATE OR REPLACE FUNCTION public.match_copilot_exemplars(
  query_embedding vector(1536),
  p_situation_class text,
  p_side text DEFAULT NULL,
  match_count integer DEFAULT 5
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
  ORDER BY
    CASE WHEN query_embedding IS NULL OR e.embedding IS NULL
         THEN 1 ELSE e.embedding <=> query_embedding END ASC,
    e.created_at DESC
  LIMIT match_count;
$$;

-- seed singleton settings row
INSERT INTO public.copilot_settings (enabled) VALUES (false);

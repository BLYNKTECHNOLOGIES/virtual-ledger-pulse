-- ===== copilot_suggestion_log =====
CREATE TABLE public.copilot_suggestion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text,
  exchange_account_id uuid,
  operator_id uuid,
  situation_class text,
  suggestion_text text NOT NULL,
  exemplar_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'shown',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.copilot_suggestion_log TO authenticated;
GRANT ALL ON public.copilot_suggestion_log TO service_role;
ALTER TABLE public.copilot_suggestion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY terminal_rw_copilot_suggestion_log ON public.copilot_suggestion_log
  FOR ALL TO authenticated
  USING (verify_terminal_access((select auth.uid())))
  WITH CHECK (verify_terminal_access((select auth.uid())));
CREATE POLICY service_all_copilot_suggestion_log ON public.copilot_suggestion_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_copilot_sugg_log_order ON public.copilot_suggestion_log (order_number);
CREATE INDEX idx_copilot_sugg_log_created ON public.copilot_suggestion_log (created_at DESC);
CREATE INDEX idx_copilot_sugg_log_status ON public.copilot_suggestion_log (status);
CREATE INDEX idx_copilot_sugg_log_account ON public.copilot_suggestion_log (exchange_account_id);

-- ===== copilot_blacklist =====
CREATE TABLE public.copilot_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id uuid,
  pattern_text text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.copilot_blacklist TO authenticated;
GRANT ALL ON public.copilot_blacklist TO service_role;
ALTER TABLE public.copilot_blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY terminal_select_copilot_blacklist ON public.copilot_blacklist
  FOR SELECT TO authenticated
  USING (verify_terminal_access((select auth.uid())));
CREATE POLICY service_all_copilot_blacklist ON public.copilot_blacklist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===== copilot_exemplars new columns =====
ALTER TABLE public.copilot_exemplars
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acceptance_score real NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS outcome_weight real NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS source_order_number text;

-- ===== indexes for counterparty memory (nickname paths) =====
CREATE INDEX IF NOT EXISTS idx_binance_order_history_nick
  ON public.binance_order_history (counter_part_nick_name, create_time DESC);
CREATE INDEX IF NOT EXISTS idx_terminal_appeal_cases_nick
  ON public.terminal_appeal_cases (counterparty_nickname);

-- ===== retrieval RPC: quality-weighted ranking + pinned boost =====
DROP FUNCTION IF EXISTS public.match_copilot_exemplars(vector, text, text, integer);
DROP FUNCTION IF EXISTS public.match_copilot_exemplars(vector, text, text, integer, uuid);
CREATE FUNCTION public.match_copilot_exemplars(
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
  similarity double precision,
  pinned boolean,
  acceptance_score real,
  outcome_weight real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.situation_class, e.side, e.context_text, e.reply_text, e.language,
         CASE WHEN query_embedding IS NULL OR e.embedding IS NULL
              THEN 0::double precision
              ELSE 1 - (e.embedding <=> query_embedding) END AS similarity,
         e.pinned, e.acceptance_score, e.outcome_weight
  FROM public.copilot_exemplars e
  WHERE e.situation_class = p_situation_class
    AND (p_side IS NULL OR e.side IS NULL OR e.side = p_side)
    AND (p_exchange_account_id IS NULL OR e.exchange_account_id = p_exchange_account_id)
  ORDER BY
    (CASE WHEN query_embedding IS NULL OR e.embedding IS NULL
          THEN 0
          ELSE 1 - (e.embedding <=> query_embedding) END)
      * e.acceptance_score * e.outcome_weight * (CASE WHEN e.pinned THEN 2 ELSE 1 END) DESC,
    e.pinned DESC,
    e.created_at DESC
  LIMIT match_count;
$$;
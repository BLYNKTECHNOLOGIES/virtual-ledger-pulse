ALTER TABLE public.p2p_auto_pay_log
ADD COLUMN IF NOT EXISTS decision_reason TEXT,
ADD COLUMN IF NOT EXISTS raw_status TEXT,
ADD COLUMN IF NOT EXISTS source TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_p2p_auto_pay_log_executed_at ON public.p2p_auto_pay_log(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2p_auto_pay_log_status ON public.p2p_auto_pay_log(status);
CREATE INDEX IF NOT EXISTS idx_p2p_auto_pay_log_decision_reason ON public.p2p_auto_pay_log(decision_reason);

CREATE TABLE IF NOT EXISTS public.p2p_auto_pay_engine_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  total_orders INTEGER NOT NULL DEFAULT 0,
  candidates INTEGER NOT NULL DEFAULT 0,
  attempted INTEGER NOT NULL DEFAULT 0,
  auto_paid INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  warnings INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  auto_assigned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.p2p_auto_pay_engine_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_view_p2p_auto_pay_engine_runs"
ON public.p2p_auto_pay_engine_runs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "service_all_p2p_auto_pay_engine_runs"
ON public.p2p_auto_pay_engine_runs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_p2p_auto_pay_engine_runs_started_at ON public.p2p_auto_pay_engine_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2p_auto_pay_engine_runs_status ON public.p2p_auto_pay_engine_runs(status);
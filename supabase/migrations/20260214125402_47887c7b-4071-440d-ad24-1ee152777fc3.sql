
-- Auto-assignment configuration table
CREATE TABLE IF NOT EXISTS public.terminal_auto_assignment_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  assignment_strategy TEXT NOT NULL DEFAULT 'least_workload', -- least_workload, round_robin
  max_orders_per_operator INTEGER NOT NULL DEFAULT 10,
  consider_specialization BOOLEAN NOT NULL DEFAULT true,
  consider_shift BOOLEAN NOT NULL DEFAULT true,
  consider_size_range BOOLEAN NOT NULL DEFAULT true,
  consider_exchange_mapping BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_auto_assignment_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read auto-assignment config"
  ON public.terminal_auto_assignment_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage auto-assignment config"
  ON public.terminal_auto_assignment_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insert default config
INSERT INTO public.terminal_auto_assignment_config (is_enabled, assignment_strategy)
VALUES (false, 'least_workload')
ON CONFLICT DO NOTHING;

-- Auto-assignment log for tracking each auto-routed order
CREATE TABLE IF NOT EXISTS public.terminal_auto_assignment_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  strategy_used TEXT NOT NULL,
  eligible_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_auto_assignment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read auto-assignment logs"
  ON public.terminal_auto_assignment_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert auto-assignment logs"
  ON public.terminal_auto_assignment_log FOR INSERT TO authenticated WITH CHECK (true);

-- MPI snapshots for historical performance tracking
CREATE TABLE IF NOT EXISTS public.terminal_mpi_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  orders_handled INTEGER NOT NULL DEFAULT 0,
  orders_completed INTEGER NOT NULL DEFAULT 0,
  orders_cancelled INTEGER NOT NULL DEFAULT 0,
  total_volume NUMERIC NOT NULL DEFAULT 0,
  avg_completion_time_minutes NUMERIC,
  buy_count INTEGER NOT NULL DEFAULT 0,
  sell_count INTEGER NOT NULL DEFAULT 0,
  idle_time_minutes NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

ALTER TABLE public.terminal_mpi_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read MPI snapshots"
  ON public.terminal_mpi_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert MPI snapshots"
  ON public.terminal_mpi_snapshots FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update MPI snapshots"
  ON public.terminal_mpi_snapshots FOR UPDATE TO authenticated USING (true);

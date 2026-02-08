
-- ══════════════════════════════════════════════════════
-- Phase 5: Automation — Auto-reply workflows & Merchant scheduling
-- ══════════════════════════════════════════════════════

-- Auto-reply workflow rules
CREATE TABLE public.p2p_auto_reply_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('order_received', 'payment_marked', 'order_completed', 'timer_breach')),
  trade_type TEXT CHECK (trade_type IN ('BUY', 'SELL', NULL)),
  message_template TEXT NOT NULL,
  delay_seconds INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 0,
  conditions JSONB DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.p2p_auto_reply_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view auto reply rules" ON public.p2p_auto_reply_rules FOR SELECT USING (true);
CREATE POLICY "Anyone can insert auto reply rules" ON public.p2p_auto_reply_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update auto reply rules" ON public.p2p_auto_reply_rules FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete auto reply rules" ON public.p2p_auto_reply_rules FOR DELETE USING (true);

-- Auto-reply execution log
CREATE TABLE public.p2p_auto_reply_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID REFERENCES public.p2p_auto_reply_rules(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  message_sent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.p2p_auto_reply_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view auto reply logs" ON public.p2p_auto_reply_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert auto reply logs" ON public.p2p_auto_reply_log FOR INSERT WITH CHECK (true);

-- Merchant schedule (online/offline time slots)
CREATE TABLE public.p2p_merchant_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Default Schedule',
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  action TEXT NOT NULL DEFAULT 'go_online' CHECK (action IN ('go_online', 'go_offline', 'take_rest')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.p2p_merchant_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view schedules" ON public.p2p_merchant_schedules FOR SELECT USING (true);
CREATE POLICY "Anyone can insert schedules" ON public.p2p_merchant_schedules FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update schedules" ON public.p2p_merchant_schedules FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete schedules" ON public.p2p_merchant_schedules FOR DELETE USING (true);

-- Index for quick lookups
CREATE INDEX idx_auto_reply_rules_trigger ON public.p2p_auto_reply_rules(trigger_event, is_active);
CREATE INDEX idx_auto_reply_log_order ON public.p2p_auto_reply_log(order_number);
CREATE INDEX idx_merchant_schedules_day ON public.p2p_merchant_schedules(day_of_week, is_active);

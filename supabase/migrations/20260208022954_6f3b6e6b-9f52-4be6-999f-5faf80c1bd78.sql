
-- ==========================================
-- P2P Terminal: Orders + Repeat Client Detection
-- ==========================================

-- 1. Counterparty registry — tracks unique counterparties across orders
CREATE TABLE public.p2p_counterparties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  binance_nickname TEXT NOT NULL,
  -- Future: payment identifiers if API provides them
  payment_identifiers JSONB DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_buy_orders INT NOT NULL DEFAULT 0,
  total_sell_orders INT NOT NULL DEFAULT 0,
  total_volume_inr NUMERIC(16,2) NOT NULL DEFAULT 0,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique on nickname (primary identifier from Binance)
CREATE UNIQUE INDEX idx_p2p_counterparties_nickname ON public.p2p_counterparties (binance_nickname);

-- 2. Order records — synced from Binance order history
CREATE TABLE public.p2p_order_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  binance_order_number TEXT NOT NULL,
  binance_adv_no TEXT,
  counterparty_id UUID REFERENCES public.p2p_counterparties(id),
  counterparty_nickname TEXT NOT NULL,
  trade_type TEXT NOT NULL, -- BUY or SELL
  asset TEXT NOT NULL DEFAULT 'USDT',
  fiat_unit TEXT NOT NULL DEFAULT 'INR',
  amount NUMERIC(16,8) NOT NULL DEFAULT 0, -- crypto amount
  total_price NUMERIC(16,2) NOT NULL DEFAULT 0, -- fiat amount
  unit_price NUMERIC(16,2) NOT NULL DEFAULT 0,
  commission NUMERIC(16,8) NOT NULL DEFAULT 0,
  order_status TEXT NOT NULL DEFAULT 'TRADING',
  pay_method_name TEXT,
  binance_create_time BIGINT,
  -- Repeat detection metadata
  is_repeat_client BOOLEAN NOT NULL DEFAULT false,
  repeat_order_count INT NOT NULL DEFAULT 0,
  -- Operator assignment
  assigned_operator_id UUID,
  -- Order type tagging
  order_type TEXT, -- e.g., 'payment_pending', 'high_value_trade', etc.
  -- Timestamps
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_p2p_order_records_binance_no ON public.p2p_order_records (binance_order_number);
CREATE INDEX idx_p2p_order_records_counterparty ON public.p2p_order_records (counterparty_id);
CREATE INDEX idx_p2p_order_records_status ON public.p2p_order_records (order_status);
CREATE INDEX idx_p2p_order_records_trade_type ON public.p2p_order_records (trade_type);

-- 3. Order chat messages — stored locally per order
CREATE TABLE public.p2p_order_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.p2p_order_records(id) ON DELETE CASCADE,
  counterparty_id UUID REFERENCES public.p2p_counterparties(id),
  sender_type TEXT NOT NULL DEFAULT 'operator', -- 'operator' or 'counterparty'
  message_text TEXT,
  is_quick_reply BOOLEAN NOT NULL DEFAULT false,
  quick_reply_template_id UUID,
  sent_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_p2p_order_chats_order ON public.p2p_order_chats (order_id, created_at);
CREATE INDEX idx_p2p_order_chats_counterparty ON public.p2p_order_chats (counterparty_id, created_at);

-- 4. Chat media — images with 7-day TTL after order completion
CREATE TABLE public.p2p_chat_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_message_id UUID NOT NULL REFERENCES public.p2p_order_chats(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.p2p_order_records(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'image',
  file_size_bytes INT,
  expires_at TIMESTAMPTZ, -- set to completed_at + 7 days when order completes
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_p2p_chat_media_order ON public.p2p_chat_media (order_id);
CREATE INDEX idx_p2p_chat_media_expires ON public.p2p_chat_media (expires_at) WHERE expires_at IS NOT NULL;

-- 5. Quick reply templates — predefined messages per order type
CREATE TABLE public.p2p_quick_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_type TEXT, -- NULL = global, otherwise mapped to specific order type
  trade_type TEXT, -- BUY, SELL, or NULL for both
  label TEXT NOT NULL,
  message_text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Order types — configurable categories
CREATE TABLE public.p2p_order_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '199 89% 48%', -- HSL accent
  icon_name TEXT DEFAULT 'tag',
  auto_assign_rules JSONB DEFAULT '{}'::jsonb,
  notification_escalation BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default order types
INSERT INTO public.p2p_order_types (name, label, color, icon_name) VALUES
  ('payment_pending', 'Payment Pending', '38 92% 50%', 'clock'),
  ('bank_delay', 'Bank Delay', '24 95% 53%', 'alert-triangle'),
  ('high_value', 'High Value Trade', '270 68% 50%', 'trending-up'),
  ('new_user', 'New User Trade', '199 89% 48%', 'user-plus'),
  ('manual_verification', 'Manual Verification', '0 72% 51%', 'shield-check');

-- Enable RLS
ALTER TABLE public.p2p_counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2p_order_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2p_order_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2p_chat_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2p_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2p_order_types ENABLE ROW LEVEL SECURITY;

-- RLS policies: Allow all authenticated users (terminal-level permissions will be Phase 6)
CREATE POLICY "Authenticated users can read p2p_counterparties" ON public.p2p_counterparties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert p2p_counterparties" ON public.p2p_counterparties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update p2p_counterparties" ON public.p2p_counterparties FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read p2p_order_records" ON public.p2p_order_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert p2p_order_records" ON public.p2p_order_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update p2p_order_records" ON public.p2p_order_records FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read p2p_order_chats" ON public.p2p_order_chats FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert p2p_order_chats" ON public.p2p_order_chats FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete p2p_order_chats" ON public.p2p_order_chats FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read p2p_chat_media" ON public.p2p_chat_media FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert p2p_chat_media" ON public.p2p_chat_media FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete p2p_chat_media" ON public.p2p_chat_media FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read p2p_quick_replies" ON public.p2p_quick_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage p2p_quick_replies" ON public.p2p_quick_replies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read p2p_order_types" ON public.p2p_order_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage p2p_order_types" ON public.p2p_order_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Function: Upsert counterparty and update stats
CREATE OR REPLACE FUNCTION public.upsert_p2p_counterparty(
  p_nickname TEXT,
  p_trade_type TEXT,
  p_volume NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO p2p_counterparties (binance_nickname, last_seen_at, total_buy_orders, total_sell_orders, total_volume_inr)
  VALUES (
    p_nickname,
    now(),
    CASE WHEN p_trade_type = 'BUY' THEN 1 ELSE 0 END,
    CASE WHEN p_trade_type = 'SELL' THEN 1 ELSE 0 END,
    COALESCE(p_volume, 0)
  )
  ON CONFLICT (binance_nickname) DO UPDATE SET
    last_seen_at = now(),
    total_buy_orders = p2p_counterparties.total_buy_orders + CASE WHEN p_trade_type = 'BUY' THEN 1 ELSE 0 END,
    total_sell_orders = p2p_counterparties.total_sell_orders + CASE WHEN p_trade_type = 'SELL' THEN 1 ELSE 0 END,
    total_volume_inr = p2p_counterparties.total_volume_inr + COALESCE(p_volume, 0),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Function: Sync order from Binance and detect repeat
CREATE OR REPLACE FUNCTION public.sync_p2p_order(
  p_order_number TEXT,
  p_adv_no TEXT,
  p_nickname TEXT,
  p_trade_type TEXT,
  p_asset TEXT,
  p_fiat TEXT,
  p_amount NUMERIC,
  p_total_price NUMERIC,
  p_unit_price NUMERIC,
  p_commission NUMERIC,
  p_status TEXT,
  p_pay_method TEXT,
  p_create_time BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counterparty_id UUID;
  v_is_repeat BOOLEAN := false;
  v_repeat_count INT := 0;
  v_order_id UUID;
BEGIN
  -- Upsert counterparty
  v_counterparty_id := upsert_p2p_counterparty(p_nickname, p_trade_type, p_total_price);

  -- Check repeat: count previous orders with same counterparty
  SELECT COUNT(*) INTO v_repeat_count
  FROM p2p_order_records
  WHERE counterparty_id = v_counterparty_id
    AND binance_order_number != p_order_number;

  v_is_repeat := v_repeat_count > 0;

  -- Upsert order record
  INSERT INTO p2p_order_records (
    binance_order_number, binance_adv_no, counterparty_id, counterparty_nickname,
    trade_type, asset, fiat_unit, amount, total_price, unit_price, commission,
    order_status, pay_method_name, binance_create_time,
    is_repeat_client, repeat_order_count
  ) VALUES (
    p_order_number, p_adv_no, v_counterparty_id, p_nickname,
    p_trade_type, p_asset, p_fiat, p_amount, p_total_price, p_unit_price, p_commission,
    p_status, p_pay_method, p_create_time,
    v_is_repeat, v_repeat_count
  )
  ON CONFLICT (binance_order_number) DO UPDATE SET
    order_status = EXCLUDED.order_status,
    counterparty_id = EXCLUDED.counterparty_id,
    is_repeat_client = v_is_repeat,
    repeat_order_count = v_repeat_count,
    updated_at = now(),
    completed_at = CASE WHEN EXCLUDED.order_status ILIKE '%COMPLETED%' AND p2p_order_records.completed_at IS NULL THEN now() ELSE p2p_order_records.completed_at END,
    cancelled_at = CASE WHEN EXCLUDED.order_status ILIKE '%CANCEL%' AND p2p_order_records.cancelled_at IS NULL THEN now() ELSE p2p_order_records.cancelled_at END
  RETURNING id INTO v_order_id;

  -- If cancelled, delete chat messages for this order
  IF p_status ILIKE '%CANCEL%' THEN
    DELETE FROM p2p_order_chats WHERE order_id = v_order_id;
  END IF;

  -- If completed, set media expiry to 7 days from now
  IF p_status ILIKE '%COMPLETED%' THEN
    UPDATE p2p_chat_media
    SET expires_at = now() + INTERVAL '7 days'
    WHERE order_id = v_order_id AND expires_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'counterparty_id', v_counterparty_id,
    'is_repeat', v_is_repeat,
    'repeat_count', v_repeat_count
  );
END;
$$;

-- Trigger: auto-update updated_at
CREATE TRIGGER update_p2p_counterparties_updated_at
  BEFORE UPDATE ON public.p2p_counterparties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_p2p_order_records_updated_at
  BEFORE UPDATE ON public.p2p_order_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

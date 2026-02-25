
-- 1. Insert Payer role at hierarchy level 5
INSERT INTO public.p2p_terminal_roles (name, description, hierarchy_level)
VALUES ('Payer', 'Handles BUY order payment execution - fiat payout, bank allocation, and settlement confirmation', 5)
ON CONFLICT DO NOTHING;

-- 2. Grant permissions to Payer role
INSERT INTO public.p2p_terminal_role_permissions (role_id, permission)
SELECT r.id, p.perm
FROM public.p2p_terminal_roles r
CROSS JOIN (VALUES ('terminal_payer_view'::terminal_permission), ('terminal_payer_manage'::terminal_permission)) AS p(perm)
WHERE r.name = 'Payer'
ON CONFLICT DO NOTHING;

-- 3. Payer Assignment Table
CREATE TABLE IF NOT EXISTS public.terminal_payer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assignment_type text NOT NULL CHECK (assignment_type IN ('size_range', 'ad_id')),
  size_range_id uuid REFERENCES public.terminal_order_size_ranges(id) ON DELETE SET NULL,
  ad_id text,
  assigned_by uuid NOT NULL REFERENCES public.users(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_payer_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated tpa" ON public.terminal_payer_assignments FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Auto-Reply Exclusions Table
CREATE TABLE IF NOT EXISTS public.terminal_auto_reply_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  excluded_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_auto_reply_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated tare" ON public.terminal_auto_reply_exclusions FOR ALL TO public USING (true) WITH CHECK (true);

-- 5. Payer Order Log
CREATE TABLE IF NOT EXISTS public.terminal_payer_order_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  payer_id uuid NOT NULL REFERENCES public.users(id),
  action text NOT NULL DEFAULT 'marked_paid',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_payer_order_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated tpol" ON public.terminal_payer_order_log FOR ALL TO public USING (true) WITH CHECK (true);

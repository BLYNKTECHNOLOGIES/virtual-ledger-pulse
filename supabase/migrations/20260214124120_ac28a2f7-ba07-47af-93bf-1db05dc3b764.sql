
-- =====================================================
-- Terminal Hierarchy & Jurisdiction System - Phase 1
-- =====================================================

-- 1. Add hierarchy_level to existing roles table
ALTER TABLE public.p2p_terminal_roles 
ADD COLUMN IF NOT EXISTS hierarchy_level integer DEFAULT NULL;

-- Update existing roles with hierarchy levels
-- Level 1 = COO (highest), Level 5 = Operator (lowest)
UPDATE public.p2p_terminal_roles SET hierarchy_level = 0 WHERE name = 'Admin';

-- 2. Terminal user profiles (supervisor mapping, specialization, shift)
CREATE TABLE public.terminal_user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reports_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  specialization text NOT NULL DEFAULT 'both' CHECK (specialization IN ('purchase', 'sales', 'both')),
  shift text DEFAULT NULL CHECK (shift IN ('morning', 'evening', 'night', NULL)),
  is_active boolean NOT NULL DEFAULT true,
  automation_included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.terminal_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Terminal user profiles are readable by authenticated"
  ON public.terminal_user_profiles FOR SELECT USING (true);

CREATE POLICY "Terminal user profiles are manageable by terminal admins"
  ON public.terminal_user_profiles FOR ALL USING (true);

-- 3. Exchange accounts master table
CREATE TABLE public.terminal_exchange_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  account_identifier text NOT NULL,
  exchange_platform text NOT NULL DEFAULT 'binance',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_identifier, exchange_platform)
);

ALTER TABLE public.terminal_exchange_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Exchange accounts readable by all" 
  ON public.terminal_exchange_accounts FOR SELECT USING (true);

CREATE POLICY "Exchange accounts manageable"
  ON public.terminal_exchange_accounts FOR ALL USING (true);

-- 4. User-to-exchange account mapping
CREATE TABLE public.terminal_user_exchange_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exchange_account_id uuid NOT NULL REFERENCES public.terminal_exchange_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange_account_id)
);

ALTER TABLE public.terminal_user_exchange_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User exchange mappings readable" 
  ON public.terminal_user_exchange_mappings FOR SELECT USING (true);

CREATE POLICY "User exchange mappings manageable"
  ON public.terminal_user_exchange_mappings FOR ALL USING (true);

-- 5. Order size range definitions
CREATE TABLE public.terminal_order_size_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_amount numeric NOT NULL DEFAULT 0,
  max_amount numeric, -- NULL means no upper limit
  currency text NOT NULL DEFAULT 'INR',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_order_size_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Size ranges readable" 
  ON public.terminal_order_size_ranges FOR SELECT USING (true);

CREATE POLICY "Size ranges manageable"
  ON public.terminal_order_size_ranges FOR ALL USING (true);

-- 6. User-to-size-range mapping
CREATE TABLE public.terminal_user_size_range_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  size_range_id uuid NOT NULL REFERENCES public.terminal_order_size_ranges(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, size_range_id)
);

ALTER TABLE public.terminal_user_size_range_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User size range mappings readable" 
  ON public.terminal_user_size_range_mappings FOR SELECT USING (true);

CREATE POLICY "User size range mappings manageable"
  ON public.terminal_user_size_range_mappings FOR ALL USING (true);

-- 7. Assignment audit log
CREATE TABLE public.terminal_assignment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL, -- 'assigned', 'reassigned', 'unassigned', 'role_changed', 'supervisor_changed'
  target_user_id uuid NOT NULL REFERENCES public.users(id),
  performed_by uuid NOT NULL REFERENCES public.users(id),
  previous_value jsonb DEFAULT NULL, -- e.g. { "assignee": "user-id", "role": "Operator" }
  new_value jsonb DEFAULT NULL,
  jurisdiction_layer text DEFAULT NULL, -- hierarchy level name
  order_reference text DEFAULT NULL,
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_assignment_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignment audit logs readable"
  ON public.terminal_assignment_audit_logs FOR SELECT USING (true);

CREATE POLICY "Assignment audit logs insertable"
  ON public.terminal_assignment_audit_logs FOR INSERT WITH CHECK (true);

-- 8. RPC: Get user's reporting tree (all subordinates recursively)
CREATE OR REPLACE FUNCTION public.get_terminal_subordinates(p_user_id uuid)
RETURNS TABLE(user_id uuid, depth integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT tup.user_id, 1 AS depth
    FROM terminal_user_profiles tup
    WHERE tup.reports_to = p_user_id
    UNION ALL
    SELECT tup.user_id, t.depth + 1
    FROM terminal_user_profiles tup
    JOIN tree t ON tup.reports_to = t.user_id
    WHERE t.depth < 10 -- safety limit
  )
  SELECT tree.user_id, tree.depth FROM tree;
$$;

-- 9. Update timestamp trigger for new tables
CREATE OR REPLACE FUNCTION public.update_terminal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_terminal_user_profiles_updated_at
  BEFORE UPDATE ON public.terminal_user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_terminal_updated_at();

CREATE TRIGGER update_terminal_exchange_accounts_updated_at
  BEFORE UPDATE ON public.terminal_exchange_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_terminal_updated_at();

CREATE TRIGGER update_terminal_order_size_ranges_updated_at
  BEFORE UPDATE ON public.terminal_order_size_ranges
  FOR EACH ROW EXECUTE FUNCTION public.update_terminal_updated_at();

-- 10. Insert default size ranges
INSERT INTO public.terminal_order_size_ranges (name, min_amount, max_amount) VALUES
  ('Small', 0, 50000),
  ('Medium', 50000, 200000),
  ('Large', 200000, 500000),
  ('Extra Large', 500000, NULL);

-- 11. Insert default hierarchy roles (keep existing Admin/Operator/Viewer, add new hierarchy roles)
INSERT INTO public.p2p_terminal_roles (name, description, is_default, hierarchy_level) VALUES
  ('COO', 'Chief Operating Officer - Full operational oversight', false, 1),
  ('Operations Manager', 'Manages operations teams and exchange allocation', false, 2),
  ('Assistant Manager', 'Manages team leads and shift operations', false, 3),
  ('Team Lead', 'Leads a team of operators', false, 4),
  ('Operator', 'Handles trading operations', false, 5)
ON CONFLICT DO NOTHING;

-- Update existing Operator role hierarchy_level if it exists without one
UPDATE public.p2p_terminal_roles SET hierarchy_level = 5 WHERE name = 'Operator' AND hierarchy_level IS NULL;

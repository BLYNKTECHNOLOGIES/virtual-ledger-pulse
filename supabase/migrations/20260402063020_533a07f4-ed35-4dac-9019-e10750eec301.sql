
-- RACI Roles (organizational roles, not ERP system roles)
CREATE TABLE public.raci_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  department TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RACI Categories (grouping of tasks by module/function)
CREATE TABLE public.raci_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RACI Tasks (individual activities/responsibilities)
CREATE TABLE public.raci_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.raci_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RACI Assignments (the actual R/A/C/I mapping)
CREATE TABLE public.raci_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.raci_tasks(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.raci_roles(id) ON DELETE CASCADE,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('R', 'A', 'C', 'I')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, role_id)
);

-- Role KRAs (Key Result Areas)
CREATE TABLE public.role_kras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id UUID NOT NULL REFERENCES public.raci_roles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  weightage NUMERIC(5,2) DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Role KPIs (Key Performance Indicators linked to KRAs)
CREATE TABLE public.role_kpis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kra_id UUID NOT NULL REFERENCES public.role_kras(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.raci_roles(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  target TEXT,
  measurement_method TEXT,
  frequency TEXT DEFAULT 'Monthly',
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.raci_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raci_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raci_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raci_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_kras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_kpis ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables
CREATE POLICY "Public read access" ON public.raci_roles FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.raci_categories FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.raci_tasks FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.raci_assignments FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.role_kras FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.role_kpis FOR SELECT USING (true);

-- Authenticated write access (Super Admin check done in app layer)
CREATE POLICY "Authenticated write" ON public.raci_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.raci_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.raci_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.raci_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.role_kras FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write" ON public.role_kpis FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_raci_tasks_category ON public.raci_tasks(category_id);
CREATE INDEX idx_raci_assignments_task ON public.raci_assignments(task_id);
CREATE INDEX idx_raci_assignments_role ON public.raci_assignments(role_id);
CREATE INDEX idx_role_kras_role ON public.role_kras(role_id);
CREATE INDEX idx_role_kpis_kra ON public.role_kpis(kra_id);
CREATE INDEX idx_role_kpis_role ON public.role_kpis(role_id);

-- Updated_at triggers
CREATE TRIGGER update_raci_roles_updated_at BEFORE UPDATE ON public.raci_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_raci_categories_updated_at BEFORE UPDATE ON public.raci_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_raci_tasks_updated_at BEFORE UPDATE ON public.raci_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_raci_assignments_updated_at BEFORE UPDATE ON public.raci_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_role_kras_updated_at BEFORE UPDATE ON public.role_kras FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_role_kpis_updated_at BEFORE UPDATE ON public.role_kpis FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

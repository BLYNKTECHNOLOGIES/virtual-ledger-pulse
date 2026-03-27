
-- Enums for task status and priority
CREATE TYPE public.erp_task_status AS ENUM ('open', 'in_progress', 'completed');
CREATE TYPE public.erp_task_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- Add tasks permissions to app_permission enum
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'tasks_view';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'tasks_manage';

-- 1. Core tasks table
CREATE TABLE public.erp_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status public.erp_task_status NOT NULL DEFAULT 'open',
  priority public.erp_task_priority NOT NULL DEFAULT 'medium',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  due_date timestamptz,
  is_recurring boolean DEFAULT false,
  recurrence_type text CHECK (recurrence_type IN ('daily', 'weekly')),
  recurrence_days int[],
  recurrence_time time,
  parent_task_id uuid REFERENCES public.erp_tasks(id) ON DELETE SET NULL,
  completed_at timestamptz,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_tasks_assignee ON public.erp_tasks(assignee_id);
CREATE INDEX idx_erp_tasks_created_by ON public.erp_tasks(created_by);
CREATE INDEX idx_erp_tasks_status ON public.erp_tasks(status);
CREATE INDEX idx_erp_tasks_due_date ON public.erp_tasks(due_date);

-- 2. Assignment chain history
CREATE TABLE public.erp_task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.erp_tasks(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_task_assignments_task ON public.erp_task_assignments(task_id);

-- 3. Spectators
CREATE TABLE public.erp_task_spectators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.erp_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX idx_erp_task_spectators_task ON public.erp_task_spectators(task_id);
CREATE INDEX idx_erp_task_spectators_user ON public.erp_task_spectators(user_id);

-- 4. Comments
CREATE TABLE public.erp_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.erp_tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  mentions text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_task_comments_task ON public.erp_task_comments(task_id);

-- 5. Activity log (audit trail)
CREATE TABLE public.erp_task_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.erp_tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_task_activity_task ON public.erp_task_activity_log(task_id);

-- 6. Attachments
CREATE TABLE public.erp_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.erp_tasks(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_task_attachments_task ON public.erp_task_attachments(task_id);

-- 7. Templates
CREATE TABLE public.erp_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority public.erp_task_priority DEFAULT 'medium',
  tags text[],
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: Enable with permissive anon access (custom auth pattern)
ALTER TABLE public.erp_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_task_spectators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_task_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_erp_tasks" ON public.erp_tasks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_erp_task_assignments" ON public.erp_task_assignments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_erp_task_spectators" ON public.erp_task_spectators FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_erp_task_comments" ON public.erp_task_comments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_erp_task_activity_log" ON public.erp_task_activity_log FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_erp_task_attachments" ON public.erp_task_attachments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_erp_task_templates" ON public.erp_task_templates FOR ALL TO anon USING (true) WITH CHECK (true);

-- Updated_at trigger for erp_tasks
CREATE OR REPLACE FUNCTION public.update_erp_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_erp_tasks_updated_at
  BEFORE UPDATE ON public.erp_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_erp_tasks_updated_at();

-- Storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "anon_all_task_attachments_storage" ON storage.objects FOR ALL TO anon USING (bucket_id = 'task-attachments') WITH CHECK (bucket_id = 'task-attachments');

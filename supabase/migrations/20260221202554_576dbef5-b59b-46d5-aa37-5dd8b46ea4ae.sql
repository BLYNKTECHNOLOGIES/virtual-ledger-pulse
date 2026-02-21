
ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hr_employees_user_id ON public.hr_employees(user_id) WHERE user_id IS NOT NULL;

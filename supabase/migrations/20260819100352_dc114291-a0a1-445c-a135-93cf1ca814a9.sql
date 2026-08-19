UPDATE public.hr_employees SET marital_status = lower(marital_status) WHERE marital_status IS NOT NULL;
UPDATE public.hr_employees SET marital_status = NULL WHERE marital_status IS NOT NULL AND marital_status NOT IN ('single','married','divorced','widowed','other');
ALTER TABLE public.hr_employees DROP CONSTRAINT IF EXISTS hr_employees_marital_status_check;
ALTER TABLE public.hr_employees ADD CONSTRAINT hr_employees_marital_status_check CHECK (marital_status IS NULL OR marital_status = ANY (ARRAY['single','married','divorced','widowed','other']));
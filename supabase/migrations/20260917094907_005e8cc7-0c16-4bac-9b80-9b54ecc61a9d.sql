
-- 1) Keep CBT department list mirrored from company departments
CREATE OR REPLACE FUNCTION public.cbt_sync_department_from_company()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.cbt_departments (code, name)
  VALUES (NEW.code, NEW.name)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_cbt_sync_department ON public.departments;
CREATE TRIGGER trg_cbt_sync_department
AFTER INSERT OR UPDATE OF code, name ON public.departments
FOR EACH ROW EXECUTE FUNCTION public.cbt_sync_department_from_company();

INSERT INTO public.cbt_departments (code, name)
SELECT code, name FROM public.departments
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- 2) Bind CBT job roles to company positions
ALTER TABLE public.cbt_job_roles
  ADD COLUMN IF NOT EXISTS position_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cbt_job_roles_position_id_fkey') THEN
    ALTER TABLE public.cbt_job_roles
      ADD CONSTRAINT cbt_job_roles_position_id_fkey
      FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cbt_job_roles_position_id_key') THEN
    ALTER TABLE public.cbt_job_roles
      ADD CONSTRAINT cbt_job_roles_position_id_key UNIQUE (position_id);
  END IF;
END $$;

UPDATE public.cbt_job_roles r
SET position_id = p.id
FROM public.positions p
WHERE r.position_id IS NULL AND lower(btrim(p.title)) = lower(btrim(r.name));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cbt_job_roles WHERE position_id IS NULL) THEN
    ALTER TABLE public.cbt_job_roles ALTER COLUMN position_id SET NOT NULL;
  END IF;
END $$;

-- 3) Derive role identity from the linked position (single source of truth)
CREATE OR REPLACE FUNCTION public.cbt_job_role_derive_from_position()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD; dcode text;
BEGIN
  IF NEW.position_id IS NULL THEN
    RAISE EXCEPTION 'A quiz role must be linked to a company position';
  END IF;

  SELECT po.title, po.department_id, po.hierarchy_level, po.is_active
    INTO p FROM public.positions po WHERE po.id = NEW.position_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked company position no longer exists';
  END IF;

  SELECT d.code INTO dcode FROM public.departments d WHERE d.id = p.department_id;
  IF dcode IS NULL THEN
    RAISE EXCEPTION 'Company position "%" has no department assigned; assign a department first', p.title;
  END IF;

  INSERT INTO public.cbt_departments (code, name)
  SELECT d.code, d.name FROM public.departments d WHERE d.id = p.department_id
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

  NEW.name := p.title;
  NEW.department_code := dcode;
  NEW.level := COALESCE(p.hierarchy_level, NEW.level);
  IF TG_OP = 'INSERT' AND p.is_active IS FALSE THEN
    NEW.is_active := false;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_cbt_job_role_derive ON public.cbt_job_roles;
CREATE TRIGGER trg_cbt_job_role_derive
BEFORE INSERT OR UPDATE ON public.cbt_job_roles
FOR EACH ROW EXECUTE FUNCTION public.cbt_job_role_derive_from_position();

-- 4) Propagate position changes to the linked quiz role
CREATE OR REPLACE FUNCTION public.cbt_propagate_position_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dcode text;
BEGIN
  SELECT d.code INTO dcode FROM public.departments d WHERE d.id = NEW.department_id;

  UPDATE public.cbt_job_roles r
  SET name = NEW.title,
      department_code = COALESCE(dcode, r.department_code),
      level = COALESCE(NEW.hierarchy_level, r.level),
      is_active = CASE WHEN NEW.is_active IS FALSE THEN false ELSE r.is_active END,
      updated_at = now()
  WHERE r.position_id = NEW.id;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_cbt_propagate_position_change ON public.positions;
CREATE TRIGGER trg_cbt_propagate_position_change
AFTER UPDATE OF title, department_id, hierarchy_level, is_active ON public.positions
FOR EACH ROW EXECUTE FUNCTION public.cbt_propagate_position_change();

CREATE INDEX IF NOT EXISTS idx_cbt_job_roles_position ON public.cbt_job_roles(position_id);

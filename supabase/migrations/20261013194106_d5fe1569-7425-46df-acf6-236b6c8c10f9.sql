GRANT EXECUTE ON FUNCTION public.hr_wf_is_manager(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_guard_requirement_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.status,'') NOT IN ('draft','pending_approval') THEN
      RAISE EXCEPTION 'A new hiring requirement can only start as a draft or awaiting approval';
    END IF;
    IF coalesce(NEW.source,'manual') <> 'manual' THEN
      RAISE EXCEPTION 'Only manual hiring requirements can be created here';
    END IF;
    IF coalesce(NEW.positions_filled,0) <> 0 OR NEW.approver_id IS NOT NULL OR NEW.approver_name IS NOT NULL
       OR NEW.approved_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
      RAISE EXCEPTION 'A new hiring requirement cannot be pre-approved or pre-filled';
    END IF;
    NEW.source := 'manual';
    NEW.requirement_no := NULL;  -- assigned by a1_hr_wf_assign_requirement_no
    NEW.requested_by := auth.uid();
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approver_id IS DISTINCT FROM OLD.approver_id
     OR NEW.approver_name IS DISTINCT FROM OLD.approver_name
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.positions_filled IS DISTINCT FROM OLD.positions_filled
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.requirement_no IS DISTINCT FROM OLD.requirement_no THEN
    RAISE EXCEPTION 'Status, approval, filled count, source and number change only through the requirement actions';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_guard_requirement_columns() FROM PUBLIC, anon, authenticated;
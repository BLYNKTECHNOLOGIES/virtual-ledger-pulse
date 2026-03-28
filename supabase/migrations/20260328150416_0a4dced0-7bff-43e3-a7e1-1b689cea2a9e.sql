
-- O3: Auto-set first_response_at when a comment/activity is logged for an open task
CREATE OR REPLACE FUNCTION public.set_first_response_on_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When activity is logged (comment, status change, etc.), set first_response_at if not already set
  IF NEW.action IN ('comment', 'status_change', 'reassigned') THEN
    UPDATE erp_tasks
    SET first_response_at = NOW()
    WHERE id = NEW.task_id
      AND first_response_at IS NULL
      AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_first_response_on_activity
  AFTER INSERT ON erp_task_activity_log
  FOR EACH ROW
  EXECUTE FUNCTION public.set_first_response_on_activity();

-- O4: Prevent overlapping penalty rule ranges
-- First enable btree_gist extension (required for exclusion constraints on scalar types)
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE hr_penalty_rules
  ADD CONSTRAINT hr_penalty_rules_no_overlap
  EXCLUDE USING GIST (
    int4range(late_count_min, COALESCE(late_count_max, 999), '[]') WITH &&
  )
  WHERE (is_active = true);

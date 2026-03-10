-- Add select_all_size_ranges flag to user profiles
ALTER TABLE public.terminal_user_profiles 
ADD COLUMN IF NOT EXISTS select_all_size_ranges boolean NOT NULL DEFAULT false;

-- Trigger: when a new size range is created, auto-assign it to all users with select_all_size_ranges = true
CREATE OR REPLACE FUNCTION public.auto_assign_new_size_range()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO terminal_user_size_range_mappings (user_id, size_range_id)
  SELECT p.user_id, NEW.id
  FROM terminal_user_profiles p
  WHERE p.select_all_size_ranges = true
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM terminal_user_size_range_mappings m
      WHERE m.user_id = p.user_id AND m.size_range_id = NEW.id
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_size_range ON terminal_order_size_ranges;
CREATE TRIGGER trg_auto_assign_size_range
  AFTER INSERT ON terminal_order_size_ranges
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_new_size_range();

-- Also handle when a size range is re-activated
CREATE OR REPLACE FUNCTION public.auto_assign_reactivated_size_range()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true AND (OLD.is_active = false OR OLD.is_active IS NULL) THEN
    INSERT INTO terminal_user_size_range_mappings (user_id, size_range_id)
    SELECT p.user_id, NEW.id
    FROM terminal_user_profiles p
    WHERE p.select_all_size_ranges = true
      AND p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM terminal_user_size_range_mappings m
        WHERE m.user_id = p.user_id AND m.size_range_id = NEW.id
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_reactivated_size_range ON terminal_order_size_ranges;
CREATE TRIGGER trg_auto_assign_reactivated_size_range
  AFTER UPDATE ON terminal_order_size_ranges
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_reactivated_size_range();
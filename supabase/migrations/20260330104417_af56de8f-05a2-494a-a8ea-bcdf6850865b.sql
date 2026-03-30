-- Drop stale save_terminal_role overload with swapped args (missing set_config fix)
DROP FUNCTION IF EXISTS public.save_terminal_role(uuid, text, text, text[], integer);
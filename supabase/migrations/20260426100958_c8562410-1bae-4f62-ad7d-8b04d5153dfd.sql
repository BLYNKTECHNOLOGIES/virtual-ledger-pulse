UPDATE public.terminal_appeal_cases
SET status = 'cancelled',
    response_timer_minutes = NULL,
    response_due_at = NULL,
    response_timer_set_by = NULL,
    response_timer_set_at = NULL,
    updated_at = now()
WHERE order_number IN ('22881398883313889280', '22881448113048702976');

UPDATE public.terminal_appeal_cases c
SET status = 'respond_by_set',
    updated_at = now()
WHERE c.order_number = '22881339265604837376';
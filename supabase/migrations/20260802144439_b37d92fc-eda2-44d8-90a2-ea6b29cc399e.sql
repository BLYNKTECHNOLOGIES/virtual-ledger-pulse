UPDATE public.hr_drift_alerts
SET resolved_at = now(),
    resolution_note = 'Auto-closed 2026-08-02: re-verified live — HRMS and RazorpayX both hold annual CTC 912000. Original note was a stale push-failure ("Expected CTC 0") from the 25-Jul bonus-unit incident, not a value drift.'
WHERE id = '86f7e2cc-b81c-465d-91bd-fd6d68c85909'
  AND resolved_at IS NULL;
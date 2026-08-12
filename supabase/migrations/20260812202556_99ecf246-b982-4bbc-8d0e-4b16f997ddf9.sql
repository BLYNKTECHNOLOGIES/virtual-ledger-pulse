UPDATE public.hr_drift_alerts
SET resolution_note = 'RazorpayX dismissal API failed with a server-side error (UNKNOWN_EXCEPTION, HTTP 500) for this employee. Dismiss from the RazorpayX dashboard (Payroll → People → Dismiss), then Pull ← Razorpay here.',
    updated_at = now()
WHERE resolved_at IS NULL
  AND field = 'dismissal_state'
  AND resolution_note ILIKE '%non-2xx%';
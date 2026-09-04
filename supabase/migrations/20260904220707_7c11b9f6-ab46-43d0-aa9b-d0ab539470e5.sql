-- Suppress workflow notifications for system-generated leave rows (e.g. auto LOP absorption)
DROP TRIGGER IF EXISTS trg_hr_notify_leave_request ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_notify_leave_request
AFTER INSERT OR UPDATE ON public.hr_leave_requests
FOR EACH ROW
WHEN (COALESCE(NEW.source,'ess') = 'ess')
EXECUTE FUNCTION public.hr_notify_leave_request();

DROP TRIGGER IF EXISTS trg_hr_notify_leave_request_change ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_notify_leave_request_change
AFTER INSERT OR UPDATE ON public.hr_leave_requests
FOR EACH ROW
WHEN (COALESCE(NEW.source,'ess') = 'ess')
EXECUTE FUNCTION public.hr_notify_leave_request_change();

-- Clean up the spurious notifications already produced by the auto-absorption backfill
DELETE FROM public.hr_notifications n
WHERE n.type IN ('leave_requested','leave_requested_hr','leave_approval_pending','leave_request_submitted','leave_approved')
  AND EXISTS (
    SELECT 1 FROM public.hr_leave_requests r
    WHERE r.source = 'auto_lop_absorption'
      AND (n.link LIKE '%' || r.id::text || '%'
           OR (n.type = 'leave_request_submitted' AND n.created_at = r.created_at))
  );
REVOKE SELECT, INSERT, UPDATE ON public.pending_registrations FROM authenticated;
GRANT SELECT (id, username, email, first_name, last_name, phone, status, submitted_at, reviewed_at, reviewed_by, rejection_reason, badge_id, user_id) ON public.pending_registrations TO authenticated;
GRANT UPDATE (status, reviewed_at, reviewed_by, rejection_reason, badge_id, user_id) ON public.pending_registrations TO authenticated;
GRANT DELETE ON public.pending_registrations TO authenticated;
GRANT ALL ON public.pending_registrations TO service_role;
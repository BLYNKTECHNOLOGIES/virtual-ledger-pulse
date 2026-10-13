ALTER FUNCTION public.hr_wf_roles(uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.hr_wf_norm_employment_type(text) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.hr_wf_follow_desks(), public.hr_wf_validate_line_overlap(),
  public.hr_wf_progress_trigger(), public.hr_trigger_reconcile_on_change(), public.hr_wf_audit_fill(),
  public.hr_wf_audit_seat_capacity(), public.hr_wf_audit_headcount(), public.hr_wf_audit_requirement(),
  public.hr_trigger_reconcile_capacity_hiring()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_workforce_staffing_matrix(), public.hr_workforce_unplanned_scopes(),
  public.hr_reconcile_capacity_hiring(boolean), public.hr_next_hiring_requirement_no() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_staffing_matrix(), public.hr_workforce_unplanned_scopes(),
  public.hr_reconcile_capacity_hiring(boolean), public.hr_next_hiring_requirement_no() TO authenticated, service_role;
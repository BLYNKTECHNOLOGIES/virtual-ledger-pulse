# Quiz (HRMS) rules

- Quiz staff actions (drives, resume codes, add time, invalidate, decision override) go only through audited cbt_* SECURITY DEFINER RPCs that check cbt_can_manage, because every HR change to a test must be recorded in cbt_audit_log.

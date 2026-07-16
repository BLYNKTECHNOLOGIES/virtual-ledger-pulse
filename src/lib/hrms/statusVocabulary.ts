/**
 * Payroll Sync — Status Vocabulary (R2).
 *
 * Canonical dictionary that maps raw enum codes (from razorpay-payroll-proxy
 * and the sync page's dry-run/apply flows) into plain-English labels aimed at
 * HR managers, with a longer explanation for tooltips. The raw enum is still
 * exposed via the `raw` field so auditors and support can see the underlying
 * code without leaving the UI.
 *
 * Add here — do not sprinkle synonyms across components.
 */

export type StatusTone = "emerald" | "amber" | "destructive" | "info" | "default" | "primary";

export interface StatusEntry {
  raw: string;              // exact enum value emitted by the edge fn
  label: string;            // ≤ 2 words, plain English, HR-friendly
  tooltip: string;          // 1–2 sentence explanation for hover / tap
  tone: StatusTone;         // maps to StatusPill / Badge tone
}

/**
 * Every raw enum value that appears in the Razorpay sync UI. Grouped by the
 * flow that emits it — keys are the raw enum. When adding a new status, keep
 * this dictionary aligned with the edge function's return literals.
 */
export const PAYROLL_STATUS: Record<string, StatusEntry> = {
  // ── Probe catalogue (Step B) ─────────────────────────────────────────────
  ok:          { raw: "ok",          label: "Working",     tooltip: "The endpoint responded successfully.", tone: "emerald" },
  fail:        { raw: "fail",        label: "Not working", tooltip: "The endpoint returned an error — see the message on the right.", tone: "destructive" },
  not_probed:  { raw: "not_probed",  label: "Not checked", tooltip: "This endpoint needs an operator ID or contractor ID to test. Fill in the pilot IDs and re-run.", tone: "amber" },
  skipped:     { raw: "skipped",     label: "Skipped",     tooltip: "Skipped because a required input (like an employee or contractor ID) was missing.", tone: "amber" },

  // ── Import / person push (Step A + C) ────────────────────────────────────
  hit:         { raw: "hit",         label: "Found",       tooltip: "RazorpayX has an employee at this ID. It was fetched successfully.", tone: "emerald" },
  miss:        { raw: "miss",        label: "Empty",       tooltip: "RazorpayX had no employee at this ID.", tone: "default" },
  stopped:     { raw: "stopped",     label: "Stopped",     tooltip: "Import stopped early after 30 empty IDs in a row — no more employees to fetch.", tone: "info" },

  // ── Person / bank / salary / attendance push results ─────────────────────
  planned:     { raw: "planned",     label: "Ready",       tooltip: "This row would change on the next real push. Nothing has been sent yet.", tone: "primary" },
  pushed:      { raw: "pushed",      label: "Sent",        tooltip: "Successfully sent to RazorpayX.", tone: "emerald" },
  unchanged:   { raw: "unchanged",   label: "Up to date",  tooltip: "Nothing to send — the values in HRMS already match RazorpayX.", tone: "default" },
  failed:      { raw: "failed",      label: "Failed",      tooltip: "RazorpayX rejected this row. See the error snippet in the row for details, then use the retry chip once you've fixed it.", tone: "destructive" },
  invalid:     { raw: "invalid",     label: "Invalid",     tooltip: "The row has bad data (e.g. missing PAN or malformed IFSC). Fix the employee record and re-run.", tone: "destructive" },
  no_baseline: { raw: "no_baseline", label: "No baseline", tooltip: "We don't yet have a captured baseline for this employee, so we can't safely detect drift. Run a baseline import first.", tone: "amber" },
  skipped_no_baseline: { raw: "skipped_no_baseline", label: "Skipped",       tooltip: "Skipped because there is no baseline recorded for this employee yet.", tone: "amber" },
  no_erp_structure:    { raw: "no_erp_structure",    label: "No salary set", tooltip: "This employee has no salary structure in HRMS. Assign one before sending salary.", tone: "amber" },
  no_erp_attendance:   { raw: "no_erp_attendance",   label: "No attendance", tooltip: "There is no attendance recorded for this employee in the selected period.", tone: "amber" },
  blocked_config_error:  { raw: "blocked_config_error",  label: "Config error",   tooltip: "A tenant setting is misconfigured (e.g. a leave type marked paid but the amount is missing). Fix the config and re-run.", tone: "destructive" },
  blocked_period_locked: { raw: "blocked_period_locked", label: "Period locked", tooltip: "The attendance period is locked in RazorpayX (payroll already run). Choose a later period.", tone: "amber" },

  // ── Drift / apply flags used by the identity re-check ────────────────────
  drift:       { raw: "drift",       label: "Changed",     tooltip: "The identity data changed in HRMS since the last sync — a fresh push is pending.", tone: "amber" },
  match:       { raw: "match",       label: "Matched",     tooltip: "Linked to an existing HRMS employee.", tone: "emerald" },
  create_draft:{ raw: "create_draft",label: "New draft",   tooltip: "Created a draft (inactive) HRMS employee. Review before activating.", tone: "info" },
};

/** Resolve a raw enum to its entry, with a safe fallback so unknown codes still render. */
export function getStatus(raw: string | null | undefined): StatusEntry {
  if (!raw) return { raw: "unknown", label: "Unknown", tooltip: "No status reported.", tone: "default" };
  return PAYROLL_STATUS[raw] ?? { raw, label: raw.replace(/_/g, " "), tooltip: `Raw code: ${raw}`, tone: "default" };
}

/**
 * Activity labels for hr_razorpay_sync_log.action (hr_razorpay_sync_action enum).
 * Verified against pg_enum — keep aligned when new actions are added.
 * Add here — do not sprinkle synonyms across components.
 */
export const ACTIVITY_LABELS: Record<string, string> = {
  validate_creds: "Checked RazorpayX connection",
  introspect_envelope: "Configured RazorpayX endpoints",
  pull_import: "Imported employees from RazorpayX",
  pull_person: "Refreshed employee details from RazorpayX",
  push_person: "Updated name & contact on RazorpayX",
  push_bank: "Updated bank & PAN on RazorpayX",
  push_salary: "Updated salary break-up on RazorpayX",
  dry_run: "Previewed changes (nothing sent)",
  push_create: "Created record on RazorpayX",
  push_update: "Updated record on RazorpayX",
  drift_check: "Checked for changes since last sync",
  match: "Matched an employee to RazorpayX",
  create_draft: "Imported an employee as draft",
  apply_error: "An action failed — needs attention",
  unlock_bulk: "Unlocked bulk actions",
  people_dismiss: "Marked an employee as dismissed",
  push_attendance: "Sent monthly attendance to RazorpayX",
  push_attendance_recall: "Recalled attendance from RazorpayX",
  attendance_fetch: "Fetched attendance from RazorpayX",
  compute_payroll_run: "Calculated this month's salary",
  dry_run_payroll_run: "Practice ran the payroll",
  apply_payroll_pilot: "Ran payroll for a single employee",
  apply_payroll_bulk: "Ran payroll for everyone",
  lock_payroll_period: "Locked the payroll period",
  probe_payroll_run: "Checked payroll run status",
  payroll_recall: "Recalled a payroll run",
  payroll_view_payroll: "Opened payroll details",
  payroll_add_additions: "Added a payroll addition",
  payroll_add_deduction: "Added a payroll deduction",
  payroll_reset_modifications: "Reset payroll modifications",
  payroll_do_not_pay: "Marked an employee as do-not-pay",
  pull_payouts: "Verified payouts against RazorpayX",
  pull_payslips: "Downloaded payslips",
  pull_taxdocs: "Downloaded tax papers",
  ledger_auto_match: "Auto-matched with accounting books",
  ledger_signoff: "Signed off the ledger period",
  ledger_reopen: "Reopened the ledger period",
  contractor_payment_create: "Created a contractor payment",
  contractor_payment_delete: "Deleted a contractor payment",
  contractor_payment_list: "Listed contractor payments",
  contractor_payment_status: "Checked contractor payment status",
  advance_salary_create: "Created a salary advance",
};

export function getActivityLabel(action: string | null | undefined): string {
  if (!action) return "Activity";
  return ACTIVITY_LABELS[action] ?? action.replace(/_/g, " ");
}

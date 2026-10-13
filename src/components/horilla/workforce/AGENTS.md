# Workforce planning decisions

- Workforce staffing is computed only in the DB (hr_workforce_staffing_matrix: one line per role per planning shift, explicit seat_capacity_id, ATS progress); screens sum src/lib/hrms/workforce.ts per-line formulas and change requirement status only via hr_requirement_transition, because guessed scopes and netted totals miscounted.
- Workforce staffing reconciliation runs once per transaction at commit (row triggers mark hr_wf_reconcile_queue; a deferred constraint trigger runs hr_reconcile_capacity_hiring), because column-list and trigger-depth guards missed changes made by other triggers.

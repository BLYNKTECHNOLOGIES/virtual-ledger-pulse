## MPI Module — Enterprise KPI/KRA/Performance Framework

Add a new **MPI** sub-tab (Management Performance Index) under the HRMS/PMS area as a comprehensive, department-aware performance scoring system aligned with MNC fintech standards.

### Where it lives
- New route: `/hrms/pms/mpi` (sub-tab under existing PMS Dashboard)
- New nav entry "MPI" inside the PMS tab strip alongside Objectives, 360° Feedback

### Scope of Phase 1 build (Tracking phase — no incentives wired to payroll yet)

**1. Database (new tables, all RLS-protected, audit-trailed)**
- `mpi_scorecard_templates` — department-specific weightage configs (Operations, Compliance, Management, HR, Sales, Tech). Locked weights, only Super Admin can edit.
- `mpi_kpi_definitions` — KPI catalog per template (name, category, formula_type, weight, data_source: auto/manual)
- `mpi_monthly_scores` — per-employee monthly score rows (kpi_id, raw_value, normalized_score, weighted_score, period)
- `mpi_score_overrides` — manual adjustments with reviewer + reason + dual approval
- `mpi_critical_violations` — wrong-beneficiary / AML / SOP-bypass log → caps grade at B
- `mpi_pip_records` — 30-day PIP tracking
- `mpi_promotion_eligibility` — auto-computed from 3/6-month grade trend
- `mpi_audit_log` — every score edit tracked

**2. Auto-calculation engine (edge function `compute-mpi-scores`)**
Pulls from existing tables:
- Orders completed / volume → `sales_orders` + `purchase_orders`
- Error rate / appeals → `terminal_appeals` + reversal tables
- Attendance / punctuality → `attendance` (Asia/Kolkata)
- SOP violations → `mpi_critical_violations` + existing escalation logs
- Response time → terminal chat / action timing tables
Runs monthly (cron) + on-demand recompute button.

**3. UI sub-tabs inside MPI module**
1. **KPI Dashboard** — org-wide heatmap, grade distribution, top/bottom performers
2. **Monthly Scorecards** — per-employee drill-down, category breakdown, trend chart
3. **Incentive Calculator** — read-only preview (Grade → bonus %), no payroll write in Phase 1
4. **Warning Tracker** — flagged employees (Grade C/D, repeat violations)
5. **PIP Tracker** — active 30-day plans with weekly review checkpoints
6. **Promotion Eligibility** — auto list based on grade trend matrix
7. **Compliance Violations** — critical error log with grade-cap enforcement
8. **Leaderboard** — top performers by department
9. **Scorecard Templates** (Super Admin only) — manage weightages per department

**4. Scoring logic**
- Weighted sum → 100-point scale → Grade band (S/A+/A/B/C/D)
- Critical violation override → cap at B + red flag
- Per-department template (Operations 35/25/20/10/10 split, Managers different, HR different, etc.)

**5. Anti-manipulation controls**
- All auto-calc metrics read-only; manual overrides require maker-checker (creator ≠ approver)
- Weight locking: only Super Admin can edit `mpi_scorecard_templates`; changes audit-logged
- Every score row writes to `mpi_audit_log`

### Out of scope (deferred to Phase 2/3)
- Auto-debit incentives to payroll (Phase 3)
- Bell-curve normalization
- 360° integration into MPI score (uses existing `hr_feedback_360` as read-only signal only)
- Self-review / employee-facing portal

### Permissions
- `hr_mpi_view` — view dashboards (HR + Managers)
- `hr_mpi_manage` — create/edit scores, run PIP (HR Lead, Ops Manager)
- `hr_mpi_admin` — edit templates, weightages (Super Admin only)
- Employees see only their own scorecard via existing self-service area

### Tech specifics
- Frontend: React Query for all reads (30s polling opt-in), Recharts for trend/distribution
- Backend: All scoring math in `compute-mpi-scores` edge function (deterministic, idempotent per period)
- Period key: `YYYY-MM` in Asia/Kolkata
- AlertDialog for destructive actions (per project memory)

### Confirmation needed before I start
This is a sizeable build (~7 new DB tables, 1 edge function, 9 sub-tab UIs). Want me to:
- **(A)** Build the full Phase-1 scope above in one go, or
- **(B)** Ship in two passes: first DB + core scorecard + dashboard, then PIP/promotion/leaderboard/admin tooling in a follow-up?

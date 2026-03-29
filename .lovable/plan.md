

# HRMS Gap Analysis — Final Status Report

## All Planned Items & Their Current Status

### Phase 1 (Critical Workflows) — ALL DONE ✓
| Item | Description | Status |
|------|-------------|--------|
| B1 | Resignation acknowledgement with F&F summary | ✅ Done |
| B2 | Pending approval stage in resignation flow | ✅ Done |
| B3 | Auto F&F creation with calculated values | ✅ Done |
| B4 | Dashboard broken navigation links | ✅ Done — routes now `/hrms/leave/requests` and `/hrms/attendance` |
| C1 | `onboarding_stage_id` FK mismatch | ✅ Done — set to null |
| C2 | OnboardingTaskManager employee reference | ✅ Done — prefers `employee_id` |
| C3 | Leave balance trigger | ✅ Done — verified exists |

### Phase 2 (Employee Experience) — ALL DONE ✓
| Item | Description | Status |
|------|-------------|--------|
| B5 | Salary summary in Employee Profile Payroll tab | ✅ Done — `SalarySummaryCard` shows CTC, monthly, template name |
| B7 | Auto leave allocation on employee creation | ✅ Done — `OnboardingWizard.tsx` inserts allocations for all active leave types |
| B9 | Payslip history in employee profile | ✅ Done — payslips section in Payroll tab |
| B10 | HR Policies page | ✅ Done — `HRPoliciesPage.tsx` at `/hrms/helpdesk/policies` with category filters |

### Phase 3 (Operational Maturity) — 5 of 6 DONE
| Item | Description | Status |
|------|-------------|--------|
| B6 | Onboarding default templates | ✅ Done — "Load Default Template" button with 5 stages |
| B8 | Auto-absent marking (edge function + cron) | ❌ NOT DONE |
| B11 | Enhanced reports with filters/export | ✅ Done — 8 charts, date filters, XLSX export |
| B12 | Employee list bulk actions | ✅ Done — dept transfer, shift assign, activate/deactivate, delete |
| B13 | Notification preferences enforced | ✅ Done — `HorillaHeader` filters by preference type |
| B14 | Survey response analytics | ✅ Done — analytics panel with rating/yes-no/MC/text breakdowns |

---

## The ONE Remaining Item: B8 — Auto-Absent Marking

**What it is**: The `absent_if_no_punch` toggle exists in the Attendance Policy UI, but there is no actual backend process (edge function or cron job) that runs daily to mark employees as absent if they didn't clock in.

**What's needed**:
1. Create an edge function `auto-absent-marking/index.ts` that:
   - Queries all active employees with shifts
   - Checks if they have an `hr_attendance` record for the previous day
   - For those missing, inserts an `absent` attendance record
   - Respects the `absent_if_no_punch` policy flag
2. Deploy it and register a daily cron (e.g., 2 AM) via `supabase/config.toml` or a pg_cron entry

**Implementation**:
- Edge function: ~40 lines — query employees with no attendance for yesterday, bulk insert absent records
- Cron registration: SQL migration adding `pg_cron` schedule calling the function daily

---

## Summary

**16 out of 17 planned items are fully implemented.** Only B8 (auto-absent marking via edge function + cron) remains. Everything else — resignation workflows, F&F calculations, dashboard links, data integrity fixes, salary summary, leave allocation, policies page, reports, bulk actions, notification filtering, and survey analytics — is complete and functional.


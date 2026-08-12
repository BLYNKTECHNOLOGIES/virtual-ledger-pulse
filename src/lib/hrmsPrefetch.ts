/**
 * HRMS route chunk prefetching.
 *
 * Every /hrms page is a lazily-loaded module, so the first click on a nav item
 * always pays a network round trip for the JS chunk. Hovering (or keyboard
 * focusing) a sidebar link is a strong intent signal — we start the download
 * then, so the click itself usually resolves from memory with no loading state.
 *
 * The loaders come from `import.meta.glob`, which resolves to the SAME module
 * ids Vite generates for the `lazy(() => import('./pages/horilla/X'))` calls in
 * App.tsx, so nothing is duplicated in the bundle and an already-loaded chunk
 * is a no-op.
 */

const pageLoaders = import.meta.glob("/src/pages/horilla/*.tsx");

/** Route path (exact) → page module base name. */
const ROUTE_MODULE: Record<string, string> = {
  "/hrms": "HorillaDashboard",
  "/hrms/employee": "EmployeeListPage",
  "/hrms/employee/departments": "DepartmentsPage",
  "/hrms/employee/positions": "PositionsPage",
  "/hrms/employee/documents": "EmployeeDocumentsPage",
  "/hrms/employee/separation": "SeparationPage",
  "/hrms/onboarding-pipeline": "EmployeeOnboardingPipelinePage",
  "/hrms/offboarding/fnf": "FnFSettlementPage",

  "/hrms/recruitment": "RecruitmentDashboardPage",
  "/hrms/recruitment/pipeline": "RecruitmentPipelinePage",
  "/hrms/recruitment/candidates": "CandidatesListPage",
  "/hrms/recruitment/rejected": "RejectedCandidatesPage",
  "/hrms/recruitment/interviews": "InterviewListPage",
  "/hrms/recruitment/stages": "StagesPage",
  "/hrms/recruitment/skill-zones": "SkillZonePage",
  "/hrms/recruitment/surveys": "RecruitmentSurveyPage",

  "/hrms/attendance": "AttendanceOverviewPage",
  "/hrms/attendance/biometric-devices": "BiometricDevicesPage",
  "/hrms/attendance/calendar": "AttendanceCalendarPage",
  "/hrms/attendance/summary": "AttendanceSummaryPage",
  "/hrms/attendance/shifts": "ShiftsPage",
  "/hrms/attendance/hours": "HoursOverviewPage",
  "/hrms/attendance/late-early": "LateComeEarlyOutPage",
  "/hrms/attendance/punches": "AttendancePunchesPage",
  "/hrms/attendance/regularization": "AttendanceRegularizationPage",
  "/hrms/attendance/watchdog": "AttendanceRegularizationPage",
  "/hrms/attendance/stale-sessions": "AttendanceStaleSessionsPage",
  "/hrms/attendance/period-locks": "AttendancePeriodLockPage",

  "/hrms/leave": "LeaveDashboardPage",
  "/hrms/leave/requests": "LeaveRequestsPage",
  "/hrms/leave/allocations": "LeaveAllocationsPage",
  "/hrms/leave/allocation-requests": "LeaveAllocationRequestsPage",
  "/hrms/leave/types": "LeaveTypesPage",
  "/hrms/leave/holidays": "HolidaysPage",
  "/hrms/leave/comp-off": "CompOffPage",
  "/hrms/leave/accrual-plans": "LeaveAccrualPlansPage",
  "/hrms/leave/year-end-reset": "LeaveYearEndResetPage",
  "/hrms/leave/weekly-off": "WeeklyOffPage",

  "/hrms/payroll": "PayrollDashboardPage",
  "/hrms/payroll/cockpit": "MonthlyPayrollCockpitPage",
  "/hrms/payroll/payslips": "PayslipsPage",
  "/hrms/payroll/salary-components": "SalaryComponentsPage",
  "/hrms/payroll/penalties": "PenaltyManagementPage",
  "/hrms/payroll/deposits": "DepositManagementPage",
  "/hrms/payroll/loans": "LoansPage",
  "/hrms/payroll/salary-revisions": "SalaryRevisionsPage",
  "/hrms/payroll/statutory-settings": "StatutorySettingsPage",
  "/hrms/payroll/razorpay-sync": "RazorpaySyncPage",
  "/hrms/payroll/payslip-history-import": "PayslipHistoryImportPage",
  "/hrms/payroll/salary-register-import": "SalaryRegisterImportPage",
  "/hrms/payroll/inputs": "PayrollInputsPage",
  "/hrms/payroll/shadow-calculator": "ShadowPayrollPage",

  "/hrms/asset": "AssetDashboardPage",
  "/hrms/asset/list": "AssetPage",
  "/hrms/asset/assignments": "AssetAssignmentsPage",

  "/hrms/pms": "PMSDashboardPage",
  "/hrms/pms/feedback": "Feedback360Page",
  "/hrms/pms/mpi": "MPIPage",

  "/hrms/reports": "ReportsPage",
  "/hrms/registers": "RegistersPage",
  "/hrms/reports/salary-register-projection": "SalaryRegisterProjectionPage",

  "/hrms/system-pulse": "SystemPulsePage",
  "/hrms/data-health": "DataHealthPage",
  "/hrms/helpdesk": "HelpdeskPage",
  "/hrms/helpdesk/policies": "HRPoliciesPage",
  "/hrms/organization": "OrganizationPage",
  "/hrms/documents": "DocumentsPage",
  "/hrms/announcements": "AnnouncementsPage",
  "/hrms/disciplinary-actions": "DisciplinaryActionsPage",
  "/hrms/logs": "HRLogsPage",
  "/hrms/mailbox": "MailboxPage",
};

const started = new Set<string>();

/** Kick off the chunk download for an HRMS route. Safe to call repeatedly. */
export function prefetchHrmsRoute(path: string): void {
  const moduleName = ROUTE_MODULE[path];
  if (!moduleName || started.has(moduleName)) return;
  const loader = pageLoaders[`/src/pages/horilla/${moduleName}.tsx`];
  if (!loader) return;
  started.add(moduleName);
  // Fire and forget — a failed prefetch must never surface to the user; the
  // real navigation will retry through React.lazy and report properly there.
  void loader().catch(() => started.delete(moduleName));
}

/**
 * Coarse page-family hint used to pick a matching skeleton while the chunk and
 * its first query are in flight.
 */
export type HrmsPageShape = "dashboard" | "list" | "detail";

export function hrmsPageShape(pathname: string): HrmsPageShape {
  if (/\/hrms\/(employee|recruitment\/candidates)\/[^/]+$/.test(pathname)) return "detail";
  if (/\/hrms\/attendance\/day\//.test(pathname)) return "detail";
  const dashboards = [
    "/hrms",
    "/hrms/attendance",
    "/hrms/leave",
    "/hrms/payroll",
    "/hrms/asset",
    "/hrms/pms",
    "/hrms/recruitment",
    "/hrms/reports",
    "/hrms/system-pulse",
    "/hrms/data-health",
    "/hrms/payroll/cockpit",
  ];
  if (dashboards.includes(pathname)) return "dashboard";
  return "list";
}

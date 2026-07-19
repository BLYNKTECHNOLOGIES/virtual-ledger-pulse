
import React, { useEffect, Suspense } from 'react';
import { lazyWithRetry as lazy } from './lib/lazyWithRetry';

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
// --- Eager: app shell, providers, guards, first-paint login, tiny 404 ---
import { TerminalLayout } from './components/terminal/TerminalLayout';
import { LoginPage } from './components/website/pages/LoginPage';
import NotFound from './pages/NotFound';
import { HorillaLayout } from './components/horilla/HorillaLayout';
import { QueryProvider } from './components/QueryProvider';
import { Layout } from './components/Layout';
import { AuthProvider } from './components/AuthProvider';
import { AuthCheck } from './components/AuthCheck';
import { Toaster } from '@/components/ui/toaster';
import { RouteFallback } from './components/shared/RouteFallback';

// --- Lazy: all route page modules (all default exports) ---
const TerminalComingSoon = lazy(() => import('./pages/terminal/TerminalComingSoon'));
const TerminalPayer = lazy(() => import('./pages/terminal/TerminalPayer'));
const TerminalSmallPayments = lazy(() => import('./pages/terminal/TerminalSmallPayments'));
const TerminalAppeals = lazy(() => import('./pages/terminal/TerminalAppeals'));
const TerminalMPI = lazy(() => import('./pages/terminal/TerminalMPI'));
const TerminalAuditLogs = lazy(() => import('./pages/terminal/TerminalAuditLogs'));
const TerminalOperatorDetail = lazy(() => import('./pages/terminal/TerminalOperatorDetail'));
const InvoiceCreatorPage = lazy(() => import('./pages/InvoiceCreatorPage'));
const PaymentScreenshotGenerator = lazy(() => import('./pages/PaymentScreenshotGenerator'));
const UtilityHub = lazy(() => import('./pages/UtilityHub'));
const Tasks = lazy(() => import('./pages/Tasks'));
const ErpEntryManager = lazy(() => import('./pages/ErpEntryManager'));
const Reconciliation = lazy(() => import('./pages/Reconciliation'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));
const RaciPage = lazy(() => import('./pages/RaciPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Sales = lazy(() => import('./pages/Sales'));
const Purchase = lazy(() => import('./pages/Purchase'));
const BAMS = lazy(() => import('./pages/BAMS'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const RADashboard = lazy(() => import('./pages/RADashboard'));
const Leads = lazy(() => import('./pages/Leads'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Compliance = lazy(() => import('./pages/Compliance'));
const HelpAssistant = lazy(() => import('./pages/HelpAssistant'));
const HelpAssistantAdmin = lazy(() => import('./pages/HelpAssistantAdmin'));
const StockManagement = lazy(() => import('./pages/StockManagement'));
const Accounting = lazy(() => import('./pages/Accounting'));
const Statistics = lazy(() => import('./pages/Statistics'));
const ProfitLoss = lazy(() => import('./pages/ProfitLoss'));
const Financials = lazy(() => import('./pages/Financials'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const Shortcuts = lazy(() => import('./pages/Shortcuts'));
const RiskManagement = lazy(() => import('./pages/RiskManagement'));
const AdManager = lazy(() => import('./pages/AdManager'));
const TerminalAdManager = lazy(() => import('./pages/terminal/TerminalAdManager'));
const TerminalDashboard = lazy(() => import('./pages/terminal/TerminalDashboard'));
const TerminalLanding = lazy(() => import('./pages/terminal/TerminalLanding'));
const TerminalOrders = lazy(() => import('./pages/terminal/TerminalOrders'));
const TerminalAutomation = lazy(() => import('./pages/terminal/TerminalAutomation'));
const TerminalUsers = lazy(() => import('./pages/terminal/TerminalUsers'));
const TerminalAnalytics = lazy(() => import('./pages/terminal/TerminalAnalytics'));
const TerminalSettings = lazy(() => import('./pages/terminal/TerminalSettings'));
const TerminalAssets = lazy(() => import('./pages/terminal/TerminalAssets'));
const TerminalLogs = lazy(() => import('./pages/terminal/TerminalLogs'));
const TerminalShortcuts = lazy(() => import('./pages/terminal/TerminalShortcuts'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const HorillaDashboard = lazy(() => import('./pages/horilla/HorillaDashboard'));
const HRPoliciesPage = lazy(() => import('./pages/horilla/HRPoliciesPage'));
const EmployeeListPage = lazy(() => import('./pages/horilla/EmployeeListPage'));
const EmployeeProfilePage = lazy(() => import('./pages/horilla/EmployeeProfilePage'));
const DepartmentsPage = lazy(() => import('./pages/horilla/DepartmentsPage'));
const PositionsPage = lazy(() => import('./pages/horilla/PositionsPage'));
const AttendanceOverviewPage = lazy(() => import('./pages/horilla/AttendanceOverviewPage'));
const ShiftsPage = lazy(() => import('./pages/horilla/ShiftsPage'));
const OvertimePage = lazy(() => import('./pages/horilla/OvertimePage'));
const HourAccountsPage = lazy(() => import('./pages/horilla/HourAccountsPage'));
const LateComeEarlyOutPage = lazy(() => import('./pages/horilla/LateComeEarlyOutPage'));
const LeaveDashboardPage = lazy(() => import('./pages/horilla/LeaveDashboardPage'));
const LeaveAccrualPlansPage = lazy(() => import('./pages/horilla/LeaveAccrualPlansPage'));
const TaxConfigPage = lazy(() => import('./pages/horilla/TaxConfigPage'));
const LeaveRequestsPage = lazy(() => import('./pages/horilla/LeaveRequestsPage'));
const LeaveTypesPage = lazy(() => import('./pages/horilla/LeaveTypesPage'));
const HolidaysPage = lazy(() => import('./pages/horilla/HolidaysPage'));
const LeaveAllocationsPage = lazy(() => import('./pages/horilla/LeaveAllocationsPage'));
const AttendanceCalendarPage = lazy(() => import('./pages/horilla/AttendanceCalendarPage'));

const AttendanceSummaryPage = lazy(() => import('./pages/horilla/AttendanceSummaryPage'));
const BiometricDevicesPage = lazy(() => import('./pages/horilla/BiometricDevicesPage'));
const AttendanceRegularizationPage = lazy(() => import('./pages/horilla/AttendanceRegularizationPage'));
const AttendancePeriodLockPage = lazy(() => import('./pages/horilla/AttendancePeriodLockPage'));
const PayrollDashboardPage = lazy(() => import('./pages/horilla/PayrollDashboardPage'));
const PayslipsPage = lazy(() => import('./pages/horilla/PayslipsPage'));
const SalaryComponentsPage = lazy(() => import('./pages/horilla/SalaryComponentsPage'));
const PenaltyManagementPage = lazy(() => import('./pages/horilla/PenaltyManagementPage'));
const CompOffPage = lazy(() => import('./pages/horilla/CompOffPage'));
const DepositManagementPage = lazy(() => import('./pages/horilla/DepositManagementPage'));
const LoansPage = lazy(() => import('./pages/horilla/LoansPage'));
const LeaveYearEndResetPage = lazy(() => import('./pages/horilla/LeaveYearEndResetPage'));
const AttendancePolicyPage = lazy(() => import('./pages/horilla/AttendancePolicyPage'));
const FnFSettlementPage = lazy(() => import('./pages/horilla/FnFSettlementPage'));
const EmployeeDocumentsPage = lazy(() => import('./pages/horilla/EmployeeDocumentsPage'));
const SeparationPage = lazy(() => import('./pages/horilla/SeparationPage'));
const SalaryRevisionsPage = lazy(() => import('./pages/horilla/SalaryRevisionsPage'));
const RazorpaySyncPage = lazy(() => import('./pages/hr/RazorpaySyncPage'));
const ComplianceSettingsPage = lazy(() => import('./pages/horilla/ComplianceSettingsPage'));
const LeaveAttendanceSettingsPage = lazy(() => import('./pages/horilla/LeaveAttendanceSettingsPage'));
const SalaryStructureMirrorPage = lazy(() => import('./pages/horilla/SalaryStructureMirrorPage'));
const OfferLetterPolicyPage = lazy(() => import('./pages/horilla/OfferLetterPolicyPage'));
const PayslipHistoryImportPage = lazy(() => import('./pages/hr/PayslipHistoryImportPage'));
const SalaryRegisterImportPage = lazy(() => import('./pages/hr/SalaryRegisterImportPage'));
const PayrollInputsPage = lazy(() => import('./pages/hr/PayrollInputsPage'));
const DataHealthPage = lazy(() => import('./pages/horilla/DataHealthPage'));
const ShadowPayrollPage = lazy(() => import('./pages/hr/ShadowPayrollPage'));
const PenaltyAutoCalcPage = lazy(() => import('./pages/horilla/PenaltyAutoCalcPage'));
const AssetPage = lazy(() => import('./pages/horilla/AssetPage'));
const AssetDashboardPage = lazy(() => import('./pages/horilla/AssetDashboardPage'));
const AssetAssignmentsPage = lazy(() => import('./pages/horilla/AssetAssignmentsPage'));
const HelpdeskPage = lazy(() => import('./pages/horilla/HelpdeskPage'));
const OrganizationPage = lazy(() => import('./pages/horilla/OrganizationPage'));
const DocumentsPage = lazy(() => import('./pages/horilla/DocumentsPage'));
const AnnouncementsPage = lazy(() => import('./pages/horilla/AnnouncementsPage'));
const ReportsPage = lazy(() => import('./pages/horilla/ReportsPage'));
const PMSDashboardPage = lazy(() => import('./pages/horilla/PMSDashboardPage'));
const ObjectivesPage = lazy(() => import('./pages/horilla/ObjectivesPage'));
const Feedback360Page = lazy(() => import('./pages/horilla/Feedback360Page'));
const MPIPage = lazy(() => import('./pages/horilla/MPIPage'));
const EmployeeOnboardingPipelinePage = lazy(() => import('./pages/horilla/EmployeeOnboardingPipelinePage'));
const DisciplinaryActionsPage = lazy(() => import('./pages/horilla/DisciplinaryActionsPage'));
const WeeklyOffPage = lazy(() => import('./pages/horilla/WeeklyOffPage'));
const LeaveAllocationRequestsPage = lazy(() => import('./pages/horilla/LeaveAllocationRequestsPage'));
const RecruitmentDashboardPage = lazy(() => import('./pages/horilla/RecruitmentDashboardPage'));
const RecruitmentPipelinePage = lazy(() => import('./pages/horilla/RecruitmentPipelinePage'));
const CandidatesListPage = lazy(() => import('./pages/horilla/CandidatesListPage'));
const CandidateProfilePage = lazy(() => import('./pages/horilla/CandidateProfilePage'));
const InterviewListPage = lazy(() => import('./pages/horilla/InterviewListPage'));
const StagesPage = lazy(() => import('./pages/horilla/StagesPage'));
const SkillZonePage = lazy(() => import('./pages/horilla/SkillZonePage'));
const RecruitmentSurveyPage = lazy(() => import('./pages/horilla/RecruitmentSurveyPage'));
const RejectedCandidatesPage = lazy(() => import('./pages/horilla/RejectedCandidatesPage'));
const HRLogsPage = lazy(() => import('./pages/horilla/HRLogsPage'));
const AttendancePunchesPage = lazy(() => import('./pages/horilla/AttendancePunchesPage'));
const MonthlyHoursSummaryPage = lazy(() => import('./pages/horilla/MonthlyHoursSummaryPage'));
const ExchangeAccountsSettings = lazy(() => import('./pages/ExchangeAccountsSettings'));
const ReportSettings = lazy(() => import('./pages/ReportSettings'));
const OAuthConsent = lazy(() => import('./pages/OAuthConsent'));


const router = createBrowserRouter([
  // Login — the only public route
  {
    path: "/",
    element: <LoginPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  // MCP OAuth consent — public route (handles its own auth redirect)
  {
    path: "/.lovable/oauth/consent",
    element: <OAuthConsent />,
  },
  // ERP System Routes - All protected with authentication
  {
    path: "/dashboard",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <Dashboard />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/settings/exchange-accounts",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <ExchangeAccountsSettings />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/settings/report-formats",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <ReportSettings />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/sales",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <Sales />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/purchase",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <Purchase />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/bams",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <BAMS />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/clients",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <Clients />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/clients/:id",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <ClientDetail />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/ra-dashboard",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <RADashboard />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/leads",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <Leads />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/user-management",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <UserManagement />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/compliance",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <Compliance />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/help-assistant",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <HelpAssistant />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/help-assistant/admin",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <HelpAssistantAdmin />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/stock",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <StockManagement />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/accounting",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <Accounting />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/statistics",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <Statistics />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/profit-loss",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <ProfitLoss />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/financials",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <Financials />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
   {
     path: "/profile",
     element: (
       <QueryProvider>
           <AuthCheck>
             <Layout>
               <UserProfile />
             </Layout>
           </AuthCheck>
       </QueryProvider>
     ),
    },
    {
      path: "/shortcuts",
      element: (
        <QueryProvider>
            <AuthCheck>
              <Layout>
                <Shortcuts />
              </Layout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
   {
     path: "/tasks",
     element: (
       <QueryProvider>
           <AuthCheck>
             <Layout>
               <Tasks />
             </Layout>
           </AuthCheck>
       </QueryProvider>
     ),
   },


    {
      path: "/erp-entry",
      element: (
        <QueryProvider>
            <AuthCheck>
              <Layout>
                <ErpEntryManager />
              </Layout>
            </AuthCheck>
        </QueryProvider>
      ),
     },
    {
      path: "/reconciliation",
      element: (
        <QueryProvider>
            <AuthCheck>
              <Layout>
                <Reconciliation />
              </Layout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/risk-management",
      element: (
        <QueryProvider>
            <AuthCheck>
              <Layout>
                <RiskManagement />
              </Layout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/ad-manager",
      element: (
        <QueryProvider>
            <AuthCheck>
              <Layout>
                <AdManager />
              </Layout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    // P2P Trading Terminal routes
    {
      path: "/terminal",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalLanding />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/dashboard",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalDashboard />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/ads",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAdManager />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/orders",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalOrders />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/automation",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAutomation />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/users",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalUsers />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/analytics",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAnalytics />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/settings",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalSettings />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/assets",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAssets />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/logs",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalLogs />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/kyc",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalComingSoon
                  title="KYC Team Module"
                  description="Client verification workflow, document review, risk flagging, and approval routing — all in one place."
                  features={["Client verification workflow", "Document review & approval", "Risk flagging & assessment", "Approval routing pipeline"]}
                />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/payer",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalPayer />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/appeals",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAppeals />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/small-payments",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalSmallPayments />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/mpi",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalMPI />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/mpi/:userId",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalOperatorDetail />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/audit-logs",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAuditLogs />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/shortcuts",
      element: (
        <QueryProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalShortcuts />
              </TerminalLayout>
            </AuthCheck>
        </QueryProvider>
      ),
    },
    {
      path: "/reset-password",
      element: <ResetPassword />,
    },
    // Horilla HRMS — Isolated layout, no ERP shell
    {
      path: "/hrms",
      element: (
        <QueryProvider>
            <AuthCheck>
              <HorillaLayout />
            </AuthCheck>
        </QueryProvider>
      ),
      children: [
        { index: true, element: <HorillaDashboard /> },
        { path: "employee", element: <EmployeeListPage /> },
        { path: "employee/departments", element: <DepartmentsPage /> },
        { path: "employee/positions", element: <PositionsPage /> },
        { path: "employee/:id", element: <EmployeeProfilePage /> },
        { path: "attendance", element: <AttendanceOverviewPage /> },
        { path: "attendance/biometric-devices", element: <BiometricDevicesPage /> },
        { path: "attendance/calendar", element: <AttendanceCalendarPage /> },
        { path: "attendance/shifts", element: <ShiftsPage /> },
        { path: "attendance/overtime", element: <OvertimePage /> },
        
        { path: "attendance/hour-accounts", element: <HourAccountsPage /> },
        { path: "attendance/late-early", element: <LateComeEarlyOutPage /> },
        { path: "attendance/summary", element: <AttendanceSummaryPage /> },
        { path: "attendance/policies", element: <AttendancePolicyPage /> },
        { path: "attendance/punches", element: <AttendancePunchesPage /> },
        { path: "attendance/monthly-hours", element: <MonthlyHoursSummaryPage /> },
        { path: "attendance/regularization", element: <AttendanceRegularizationPage /> },
        { path: "attendance/period-locks", element: <AttendancePeriodLockPage /> },
        { path: "leave", element: <LeaveDashboardPage /> },
        { path: "leave/requests", element: <LeaveRequestsPage /> },
        { path: "leave/allocations", element: <LeaveAllocationsPage /> },
        { path: "leave/types", element: <LeaveTypesPage /> },
        { path: "leave/holidays", element: <HolidaysPage /> },
        { path: "leave/comp-off", element: <CompOffPage /> },
        { path: "leave/year-end-reset", element: <LeaveYearEndResetPage /> },
        { path: "leave/accrual-plans", element: <LeaveAccrualPlansPage /> },
        { path: "leave/allocation-requests", element: <LeaveAllocationRequestsPage /> },
        { path: "leave/weekly-off", element: <WeeklyOffPage /> },
        { path: "payroll", element: <PayrollDashboardPage /> },
        { path: "payroll/tax-config", element: <TaxConfigPage /> },
        { path: "payroll/payslips", element: <PayslipsPage /> },
        { path: "payroll/allowances", element: <SalaryComponentsPage componentType="allowance" /> },
        { path: "payroll/deductions", element: <SalaryComponentsPage componentType="deduction" /> },
        // Salary Structure page retired — Razorpay is the authority; per-employee breakdown is mirrored in the employee profile.
        { path: "payroll/penalties", element: <PenaltyManagementPage /> },
        { path: "payroll/deposits", element: <DepositManagementPage /> },
        { path: "payroll/loans", element: <LoansPage /> },
        { path: "asset", element: <AssetDashboardPage /> },
        { path: "asset/list", element: <AssetPage /> },
        { path: "asset/assignments", element: <AssetAssignmentsPage /> },
        { path: "pms", element: <PMSDashboardPage /> },
        { path: "pms/objectives", element: <ObjectivesPage /> },
        { path: "pms/feedback", element: <Feedback360Page /> },
        { path: "pms/mpi", element: <MPIPage /> },
        // offboarding route removed — merged into HRMS Separation tab
        { path: "offboarding/fnf", element: <FnFSettlementPage /> },
        { path: "employee/documents", element: <EmployeeDocumentsPage /> },
        { path: "employee/separation", element: <SeparationPage /> },
        { path: "payroll/salary-revisions", element: <SalaryRevisionsPage /> },
        { path: "payroll/penalty-calc", element: <PenaltyAutoCalcPage /> },
        { path: "payroll/razorpay-sync", element: <RazorpaySyncPage /> },
        { path: "payroll/compliance-settings", element: <ComplianceSettingsPage /> },
        { path: "payroll/leave-attendance-settings", element: <LeaveAttendanceSettingsPage /> },
        { path: "payroll/salary-structure-mirror", element: <SalaryStructureMirrorPage /> },
        { path: "payroll/offer-letter-policy", element: <OfferLetterPolicyPage /> },
        { path: "payroll/payslip-history-import", element: <PayslipHistoryImportPage /> },
        { path: "payroll/salary-register-import", element: <SalaryRegisterImportPage /> },
        { path: "payroll/inputs", element: <PayrollInputsPage /> },
        { path: "payroll/shadow-calculator", element: <ShadowPayrollPage /> },
        { path: "data-health", element: <DataHealthPage /> },
        { path: "helpdesk", element: <HelpdeskPage /> },
        
        { path: "helpdesk/policies", element: <HRPoliciesPage /> },
        { path: "organization", element: <OrganizationPage /> },
        { path: "documents", element: <DocumentsPage /> },
        { path: "announcements", element: <AnnouncementsPage /> },
        { path: "reports", element: <ReportsPage /> },
        { path: "onboarding-pipeline", element: <EmployeeOnboardingPipelinePage /> },
        { path: "disciplinary-actions", element: <DisciplinaryActionsPage /> },
        
        { path: "logs", element: <HRLogsPage /> },
        { path: "recruitment", element: <RecruitmentDashboardPage /> },
        { path: "recruitment/pipeline", element: <RecruitmentPipelinePage /> },
        { path: "recruitment/candidates", element: <CandidatesListPage /> },
        { path: "recruitment/candidates/:id", element: <CandidateProfilePage /> },
        { path: "recruitment/interviews", element: <InterviewListPage /> },
        { path: "recruitment/stages", element: <StagesPage /> },
        { path: "recruitment/skill-zones", element: <SkillZonePage /> },
        { path: "recruitment/surveys", element: <RecruitmentSurveyPage /> },
        { path: "recruitment/rejected", element: <RejectedCandidatesPage /> },
      ],
    },
  {
    path: "/utility",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <UtilityHub />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/utility/invoice-creator",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <InvoiceCreatorPage />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/utility/payment-screenshot",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <PaymentScreenshotGenerator />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
   // Public unsubscribe route
    {
      path: "/unsubscribe",
      element: <Unsubscribe />,
    },
    // Public RACI page
    {
      path: "/raci",
      element: <RaciPage />,
    },
   // Catch-all route for 404 errors
    {
      path: "*",
      element: <NotFound />,
    },
]);

function App() {
  useEffect(() => {
    // Prevent the browser from restoring previous scroll positions on SPA navigation
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  return (
    <React.StrictMode>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <RouterProvider router={router} />
        </Suspense>
        <Toaster />
      </AuthProvider>
    </React.StrictMode>
  );
}

export default App;

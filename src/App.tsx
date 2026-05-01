
import React, { useEffect } from 'react';

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import TerminalComingSoon from './pages/terminal/TerminalComingSoon';
import TerminalPayer from './pages/terminal/TerminalPayer';
import TerminalSmallPayments from './pages/terminal/TerminalSmallPayments';
import TerminalAppeals from './pages/terminal/TerminalAppeals';
import TerminalMPI from './pages/terminal/TerminalMPI';
import TerminalAuditLogs from './pages/terminal/TerminalAuditLogs';
import TerminalOperatorDetail from './pages/terminal/TerminalOperatorDetail';
import { TerminalLayout } from './components/terminal/TerminalLayout';
import InvoiceCreatorPage from './pages/InvoiceCreatorPage';
import PaymentScreenshotGenerator from './pages/PaymentScreenshotGenerator';
import UtilityHub from './pages/UtilityHub';
import Tasks from './pages/Tasks';
import ErpEntryManager from './pages/ErpEntryManager';
import Unsubscribe from './pages/Unsubscribe';
import RaciPage from './pages/RaciPage';
import { LoginPage } from './components/website/pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Purchase from './pages/Purchase';
import BAMS from './pages/BAMS';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Leads from './pages/Leads';
import UserManagement from './pages/UserManagement';


import Compliance from './pages/Compliance';
import StockManagement from './pages/StockManagement';
import Accounting from './pages/Accounting';
import VideoKYC from './pages/VideoKYC';
import KYCApprovals from './pages/KYCApprovals';
import Statistics from './pages/Statistics';
import ProfitLoss from './pages/ProfitLoss';
import Financials from './pages/Financials';

import UserProfile from './pages/UserProfile';

import RiskManagement from './pages/RiskManagement';
import AdManager from './pages/AdManager';
import TerminalAdManager from './pages/terminal/TerminalAdManager';
import TerminalDashboard from './pages/terminal/TerminalDashboard';
import TerminalOrders from './pages/terminal/TerminalOrders';
import TerminalAutomation from './pages/terminal/TerminalAutomation';
import TerminalUsers from './pages/terminal/TerminalUsers';
import TerminalAnalytics from './pages/terminal/TerminalAnalytics';
import TerminalSettings from './pages/terminal/TerminalSettings';
import TerminalAssets from './pages/terminal/TerminalAssets';
import TerminalLogs from './pages/terminal/TerminalLogs';
import Support from './pages/Support';
import NotFound from './pages/NotFound';
import ResetPassword from './pages/ResetPassword';
import { HorillaLayout } from './components/horilla/HorillaLayout';
import HorillaDashboard from './pages/horilla/HorillaDashboard';

import HRPoliciesPage from './pages/horilla/HRPoliciesPage';
import EmployeeListPage from './pages/horilla/EmployeeListPage';
import EmployeeProfilePage from './pages/horilla/EmployeeProfilePage';
import DepartmentsPage from './pages/horilla/DepartmentsPage';
import PositionsPage from './pages/horilla/PositionsPage';
import AttendanceOverviewPage from './pages/horilla/AttendanceOverviewPage';
import ShiftsPage from './pages/horilla/ShiftsPage';
import OvertimePage from './pages/horilla/OvertimePage';
import HourAccountsPage from './pages/horilla/HourAccountsPage';
import LateComeEarlyOutPage from './pages/horilla/LateComeEarlyOutPage';
import LeaveDashboardPage from './pages/horilla/LeaveDashboardPage';
import LeaveAccrualPlansPage from './pages/horilla/LeaveAccrualPlansPage';
import TaxConfigPage from './pages/horilla/TaxConfigPage';
import LeaveRequestsPage from './pages/horilla/LeaveRequestsPage';
import LeaveTypesPage from './pages/horilla/LeaveTypesPage';
import HolidaysPage from './pages/horilla/HolidaysPage';
import LeaveAllocationsPage from './pages/horilla/LeaveAllocationsPage';
import AttendanceCalendarPage from './pages/horilla/AttendanceCalendarPage';
import AttendanceActivityPage from './pages/horilla/AttendanceActivityPage';
import AttendanceSummaryPage from './pages/horilla/AttendanceSummaryPage';
import BiometricDevicesPage from './pages/horilla/BiometricDevicesPage';
import PayrollDashboardPage from './pages/horilla/PayrollDashboardPage';
import PayslipsPage from './pages/horilla/PayslipsPage';
import SalaryComponentsPage from './pages/horilla/SalaryComponentsPage';
import SalaryStructurePage from './pages/horilla/SalaryStructurePage';
import PenaltyManagementPage from './pages/horilla/PenaltyManagementPage';
import CompOffPage from './pages/horilla/CompOffPage';
import DepositManagementPage from './pages/horilla/DepositManagementPage';
import LoansPage from './pages/horilla/LoansPage';
import LeaveYearEndResetPage from './pages/horilla/LeaveYearEndResetPage';
import AttendancePolicyPage from './pages/horilla/AttendancePolicyPage';
import FnFSettlementPage from './pages/horilla/FnFSettlementPage';
import EmployeeDocumentsPage from './pages/horilla/EmployeeDocumentsPage';
import SeparationPage from './pages/horilla/SeparationPage';
import SalaryRevisionsPage from './pages/horilla/SalaryRevisionsPage';
import PenaltyAutoCalcPage from './pages/horilla/PenaltyAutoCalcPage';
import AssetPage from './pages/horilla/AssetPage';
import AssetDashboardPage from './pages/horilla/AssetDashboardPage';
import AssetAssignmentsPage from './pages/horilla/AssetAssignmentsPage';
import HelpdeskPage from './pages/horilla/HelpdeskPage';
// OffboardingPage removed — merged into ResignationTab (Separation)
import OrganizationPage from './pages/horilla/OrganizationPage';
import DocumentsPage from './pages/horilla/DocumentsPage';
import AnnouncementsPage from './pages/horilla/AnnouncementsPage';
import ReportsPage from './pages/horilla/ReportsPage';
import PMSDashboardPage from './pages/horilla/PMSDashboardPage';
import ObjectivesPage from './pages/horilla/ObjectivesPage';
import Feedback360Page from './pages/horilla/Feedback360Page';
import EmployeeOnboardingPipelinePage from './pages/horilla/EmployeeOnboardingPipelinePage';
import DisciplinaryActionsPage from './pages/horilla/DisciplinaryActionsPage';

import WeeklyOffPage from './pages/horilla/WeeklyOffPage';
import LeaveAllocationRequestsPage from './pages/horilla/LeaveAllocationRequestsPage';
import RecruitmentDashboardPage from './pages/horilla/RecruitmentDashboardPage';
import RecruitmentPipelinePage from './pages/horilla/RecruitmentPipelinePage';
import CandidatesListPage from './pages/horilla/CandidatesListPage';
import CandidateProfilePage from './pages/horilla/CandidateProfilePage';
import InterviewListPage from './pages/horilla/InterviewListPage';
import StagesPage from './pages/horilla/StagesPage';
import SkillZonePage from './pages/horilla/SkillZonePage';
import RecruitmentSurveyPage from './pages/horilla/RecruitmentSurveyPage';
import RejectedCandidatesPage from './pages/horilla/RejectedCandidatesPage';
import HRLogsPage from './pages/horilla/HRLogsPage';
import AttendancePunchesPage from './pages/horilla/AttendancePunchesPage';
import MonthlyHoursSummaryPage from './pages/horilla/MonthlyHoursSummaryPage';
import { QueryProvider } from './components/QueryProvider';
import { Layout } from './components/Layout';
import { AuthProvider } from './components/AuthProvider';
import { AuthCheck } from './components/AuthCheck';
import { Toaster } from '@/components/ui/toaster';

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
      path: "/support",
      element: (
        <QueryProvider>
            <AuthCheck>
              <Layout>
                <Support />
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
    path: "/video-kyc",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <VideoKYC />
            </Layout>
          </AuthCheck>
      </QueryProvider>
    ),
  },
  {
    path: "/kyc-approvals",
    element: (
      <QueryProvider>
          <AuthCheck>
            <Layout>
              <KYCApprovals />
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
        { path: "attendance/activity", element: <AttendanceActivityPage /> },
        { path: "attendance/hour-accounts", element: <HourAccountsPage /> },
        { path: "attendance/late-early", element: <LateComeEarlyOutPage /> },
        { path: "attendance/summary", element: <AttendanceSummaryPage /> },
        { path: "attendance/policies", element: <AttendancePolicyPage /> },
        { path: "attendance/punches", element: <AttendancePunchesPage /> },
        { path: "attendance/monthly-hours", element: <MonthlyHoursSummaryPage /> },
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
        { path: "payroll/salary-structure", element: <SalaryStructurePage /> },
        { path: "payroll/penalties", element: <PenaltyManagementPage /> },
        { path: "payroll/deposits", element: <DepositManagementPage /> },
        { path: "payroll/loans", element: <LoansPage /> },
        { path: "asset", element: <AssetDashboardPage /> },
        { path: "asset/list", element: <AssetPage /> },
        { path: "asset/assignments", element: <AssetAssignmentsPage /> },
        { path: "pms", element: <PMSDashboardPage /> },
        { path: "pms/objectives", element: <ObjectivesPage /> },
        { path: "pms/feedback", element: <Feedback360Page /> },
        // offboarding route removed — merged into HRMS Separation tab
        { path: "offboarding/fnf", element: <FnFSettlementPage /> },
        { path: "employee/documents", element: <EmployeeDocumentsPage /> },
        { path: "employee/separation", element: <SeparationPage /> },
        { path: "payroll/salary-revisions", element: <SalaryRevisionsPage /> },
        { path: "payroll/penalty-calc", element: <PenaltyAutoCalcPage /> },
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
        <RouterProvider router={router} />
        <Toaster />
      </AuthProvider>
    </React.StrictMode>
  );
}

export default App;

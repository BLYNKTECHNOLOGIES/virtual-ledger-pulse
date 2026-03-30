
import React, { useEffect } from 'react';

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import TerminalComingSoon from './pages/terminal/TerminalComingSoon';
import TerminalPayer from './pages/terminal/TerminalPayer';
import TerminalMPI from './pages/terminal/TerminalMPI';
import TerminalAuditLogs from './pages/terminal/TerminalAuditLogs';
import TerminalOperatorDetail from './pages/terminal/TerminalOperatorDetail';
import { TerminalLayout } from './components/terminal/TerminalLayout';
import InvoiceCreatorPage from './pages/InvoiceCreatorPage';
import UtilityHub from './pages/UtilityHub';
import Tasks from './pages/Tasks';
import Unsubscribe from './pages/Unsubscribe';
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
import Banking from './pages/Banking';
import RiskManagement from './pages/RiskManagement';
import AdManager from './pages/AdManager';
import TerminalDashboard from './pages/terminal/TerminalDashboard';
import TerminalOrders from './pages/terminal/TerminalOrders';
import TerminalAutomation from './pages/terminal/TerminalAutomation';
import TerminalUsers from './pages/terminal/TerminalUsers';
import TerminalAnalytics from './pages/terminal/TerminalAnalytics';
import TerminalSettings from './pages/terminal/TerminalSettings';
import TerminalAssets from './pages/terminal/TerminalAssets';
import TerminalLogs from './pages/terminal/TerminalLogs';
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
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Dashboard />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/sales",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Sales />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/purchase",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Purchase />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/bams",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <BAMS />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/clients",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Clients />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/clients/:id",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <ClientDetail />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/leads",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Leads />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/user-management",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <UserManagement />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/compliance",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Compliance />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/stock",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <StockManagement />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/accounting",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Accounting />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/video-kyc",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <VideoKYC />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/kyc-approvals",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <KYCApprovals />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/statistics",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Statistics />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/profit-loss",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <ProfitLoss />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/financials",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Financials />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
   {
     path: "/profile",
     element: (
       <QueryProvider>
         <AuthProvider>
           <AuthCheck>
             <Layout>
               <UserProfile />
             </Layout>
           </AuthCheck>
         </AuthProvider>
       </QueryProvider>
     ),
   },
   {
     path: "/tasks",
     element: (
       <QueryProvider>
         <AuthProvider>
           <AuthCheck>
             <Layout>
               <Tasks />
             </Layout>
           </AuthCheck>
         </AuthProvider>
       </QueryProvider>
     ),
   },
   {
     path: "/banking",
     element: (
       <QueryProvider>
         <AuthProvider>
           <AuthCheck>
             <Layout>
               <Banking />
             </Layout>
           </AuthCheck>
         </AuthProvider>
       </QueryProvider>
      ),
    },
    {
      path: "/risk-management",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <Layout>
                <RiskManagement />
              </Layout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/ad-manager",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <Layout>
                <AdManager />
              </Layout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    // P2P Trading Terminal routes
    {
      path: "/terminal",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalDashboard />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/ads",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <AdManager />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/orders",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalOrders />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/automation",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAutomation />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/users",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalUsers />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/analytics",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAnalytics />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/settings",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalSettings />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/assets",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAssets />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/logs",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalLogs />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/kyc",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalComingSoon
                  title="KYC Team Module"
                  description="Client verification workflow, document review, risk flagging, and approval routing — all in one place."
                  features={["Client verification workflow", "Document review & approval", "Risk flagging & assessment", "Approval routing pipeline"]}
                />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/payer",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalPayer />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/mpi",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalMPI />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/mpi/:userId",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalOperatorDetail />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
        </QueryProvider>
      ),
    },
    {
      path: "/terminal/audit-logs",
      element: (
        <QueryProvider>
          <AuthProvider>
            <AuthCheck>
              <TerminalLayout>
                <TerminalAuditLogs />
              </TerminalLayout>
            </AuthCheck>
          </AuthProvider>
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
          <AuthProvider>
            <AuthCheck>
              <HorillaLayout />
            </AuthCheck>
          </AuthProvider>
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
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <UtilityHub />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
  {
    path: "/utility/invoice-creator",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <InvoiceCreatorPage />
            </Layout>
          </AuthCheck>
        </AuthProvider>
      </QueryProvider>
    ),
  },
   // Public unsubscribe route
    {
      path: "/unsubscribe",
      element: <Unsubscribe />,
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
      <RouterProvider router={router} />
      <Toaster />
    </React.StrictMode>
  );
}

export default App;

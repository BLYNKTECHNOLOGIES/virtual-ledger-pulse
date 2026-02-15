
import React, { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import TerminalComingSoon from './pages/terminal/TerminalComingSoon';
import TerminalMPI from './pages/terminal/TerminalMPI';
import TerminalAuditLogs from './pages/terminal/TerminalAuditLogs';
import { TerminalLayout } from './components/terminal/TerminalLayout';
import { HomePage } from './components/website/pages/HomePage';
import { AboutPage } from './components/website/pages/AboutPage';
import { ContactPage } from './components/website/pages/ContactPage';
import { WebDevelopmentPage } from './components/website/pages/WebDevelopmentPage';
import { SEOServicesPage } from './components/website/pages/SEOServicesPage';
import { AppDevelopmentPage } from './components/website/pages/AppDevelopmentPage';
import { PrivacyPolicyPage } from './components/website/pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/website/pages/TermsOfServicePage';
import { AMLPolicyPage } from './components/website/pages/AMLPolicyPage';
import { LoginPage } from './components/website/pages/LoginPage';
import { WebsiteLayout } from './components/website/WebsiteLayout';
import { ModernHomePage } from './components/website/pages/ModernHomePage';
import { VASPPage } from './components/website/pages/VASPPage';
import { P2PTradingPage } from './components/website/pages/P2PTradingPage';
import { KYCServicesPage } from './components/website/pages/KYCServicesPage';
import { VASPCompliancePage } from './components/website/pages/VASPCompliancePage';
import { CompliancePage } from './components/website/pages/CompliancePage';
import { VASPHomePage } from './components/website/pages/VASPHomePage';
import { VASPSecurityPage } from './components/website/pages/VASPSecurityPage';
import { KYCFormPage } from './components/website/pages/KYCFormPage';
import { HelpCentrePage } from './components/website/pages/HelpCentrePage';
import { BulkTradingPage } from './components/website/pages/BulkTradingPage';
import { CorporateKYCPage } from './components/website/pages/CorporateKYCPage';
import { RelationshipManagerPage } from './components/website/pages/RelationshipManagerPage';
import { SellUSDTPage } from './components/website/pages/SellUSDTPage';
import { WhatsAppSupportPage } from './components/website/pages/WhatsAppSupportPage';
import { PaymentMethodsPage } from './components/website/pages/PaymentMethodsPage';
import { GettingStartedPage } from './components/website/pages/GettingStartedPage';
import { CareersPage } from './components/website/pages/CareersPage';
import { CareersApplyPage } from './components/website/pages/CareersApplyPage';
import { INRSettlementPage } from './components/website/pages/INRSettlementPage';
import { BuyUSDTPage } from './components/website/pages/BuyUSDTPage';
import { SellCryptoPage } from './components/website/pages/SellCryptoPage';
import { SafetyTipsPage } from './components/website/pages/SafetyTipsPage';
import { CryptoFeesPage } from './components/website/pages/CryptoFeesPage';
import { OTCDeskPage } from './components/website/pages/OTCDeskPage';
import { KYCVerificationSupportPage } from './components/website/pages/KYCVerificationSupportPage';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Purchase from './pages/Purchase';
import BAMS from './pages/BAMS';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Leads from './pages/Leads';
import UserManagement from './pages/UserManagement';
import HRMS from './pages/HRMS';
import Payroll from './pages/Payroll';
import Compliance from './pages/Compliance';
import StockManagement from './pages/StockManagement';
import Accounting from './pages/Accounting';
import VideoKYC from './pages/VideoKYC';
import KYCApprovals from './pages/KYCApprovals';
import Statistics from './pages/Statistics';
import ProfitLoss from './pages/ProfitLoss';
import Financials from './pages/Financials';
import EMS from './pages/EMS';
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
import HorillaModulePage from './pages/horilla/HorillaModulePage';
import EmployeeListPage from './pages/horilla/EmployeeListPage';
import EmployeeProfilePage from './pages/horilla/EmployeeProfilePage';
import DepartmentsPage from './pages/horilla/DepartmentsPage';
import PositionsPage from './pages/horilla/PositionsPage';
import RecruitmentDashboardPage from './pages/horilla/RecruitmentDashboardPage';
import RecruitmentPipelinePage from './pages/horilla/RecruitmentPipelinePage';
import CandidatesListPage from './pages/horilla/CandidatesListPage';
import OnboardingPage from './pages/horilla/OnboardingPage';
import { QueryProvider } from './components/QueryProvider';
import { Layout } from './components/Layout';
import { AuthProvider } from './components/AuthProvider';
import { AuthCheck } from './components/AuthCheck';

const router = createBrowserRouter([
  {
    path: "/",
    element: <WebsiteLayout><HomePage /></WebsiteLayout>,
  },
  {
    path: "/website",
    element: <WebsiteLayout><HomePage /></WebsiteLayout>,
  },
  {
    path: "/website/home",
    element: <WebsiteLayout><ModernHomePage /></WebsiteLayout>,
  },
  {
    path: "/website/about",
    element: <WebsiteLayout><AboutPage /></WebsiteLayout>,
  },
  {
    path: "/website/contact",
    element: <WebsiteLayout><ContactPage /></WebsiteLayout>,
  },
  {
    path: "/website/web-development",
    element: <WebsiteLayout><WebDevelopmentPage /></WebsiteLayout>,
  },
  {
    path: "/website/seo-services",
    element: <WebsiteLayout><SEOServicesPage /></WebsiteLayout>,
  },
  {
    path: "/website/app-development",
    element: <WebsiteLayout><AppDevelopmentPage /></WebsiteLayout>,
  },
  {
    path: "/website/privacy",
    element: <WebsiteLayout><PrivacyPolicyPage /></WebsiteLayout>,
  },
  {
    path: "/website/terms",
    element: <WebsiteLayout><TermsOfServicePage /></WebsiteLayout>,
  },
  {
    path: "/website/aml-policy",
    element: <WebsiteLayout><AMLPolicyPage /></WebsiteLayout>,
  },
  {
    path: "/website/login",
    element: <WebsiteLayout><LoginPage /></WebsiteLayout>,
  },
  {
    path: "/website/careers/apply",
    element: <WebsiteLayout><CareersApplyPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp",
    element: <WebsiteLayout><VASPPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp-home",
    element: <WebsiteLayout><VASPHomePage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/p2p-trading",
    element: <WebsiteLayout><P2PTradingPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/kyc",
    element: <WebsiteLayout><KYCServicesPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/kyc-form",
    element: <WebsiteLayout><KYCFormPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/compliance",
    element: <WebsiteLayout><VASPCompliancePage /></WebsiteLayout>,
  },
  {
    path: "/website/compliance",
    element: <WebsiteLayout><CompliancePage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/security",
    element: <WebsiteLayout><VASPSecurityPage /></WebsiteLayout>,
  },
  {
    path: "/website/buy-usdt",
    element: <WebsiteLayout><BuyUSDTPage /></WebsiteLayout>,
  },
  {
    path: "/website/fees",
    element: <WebsiteLayout><CryptoFeesPage /></WebsiteLayout>,
  },
  {
    path: "/website/kyc",
    element: <WebsiteLayout><KYCFormPage /></WebsiteLayout>,
  },
  {
    path: "/website/individual-kyc",
    element: <WebsiteLayout><KYCFormPage /></WebsiteLayout>,
  },
  {
    path: "/website/help",
    element: <WebsiteLayout><HelpCentrePage /></WebsiteLayout>,
  },
  {
    path: "/website/bulk-trading",
    element: <WebsiteLayout><BulkTradingPage /></WebsiteLayout>,
  },
  {
    path: "/website/corporate-kyc",
    element: <WebsiteLayout><CorporateKYCPage /></WebsiteLayout>,
  },
  {
    path: "/website/relationship-manager",
    element: <WebsiteLayout><RelationshipManagerPage /></WebsiteLayout>,
  },
  {
    path: "/website/sell-crypto",
    element: <WebsiteLayout><SellCryptoPage /></WebsiteLayout>,
  },
  {
    path: "/website/sell-usdt",
    element: <WebsiteLayout><SellUSDTPage /></WebsiteLayout>,
  },
  {
    path: "/website/support",
    element: <WebsiteLayout><WhatsAppSupportPage /></WebsiteLayout>,
  },
  {
    path: "/website/whatsapp-support",
    element: <WebsiteLayout><WhatsAppSupportPage /></WebsiteLayout>,
  },
  {
    path: "/website/p2p-trading",
    element: <WebsiteLayout><P2PTradingPage /></WebsiteLayout>,
  },
  {
    path: "/website/payment-methods",
    element: <WebsiteLayout><PaymentMethodsPage /></WebsiteLayout>,
  },
  {
    path: "/website/getting-started",
    element: <WebsiteLayout><GettingStartedPage /></WebsiteLayout>,
  },
  {
    path: "/website/careers",
    element: <WebsiteLayout><CareersPage /></WebsiteLayout>,
  },
  {
    path: "/website/inr-settlement",
    element: <WebsiteLayout><INRSettlementPage /></WebsiteLayout>,
  },
  {
    path: "/website/institutional-settlement",
    element: <WebsiteLayout><INRSettlementPage /></WebsiteLayout>,
  },
  {
    path: "/website/safety-tips",
    element: <WebsiteLayout><SafetyTipsPage /></WebsiteLayout>,
  },
  {
    path: "/website/otc-desk",
    element: <WebsiteLayout><OTCDeskPage /></WebsiteLayout>,
  },
  {
    path: "/website/kyc-support",
    element: <WebsiteLayout><KYCVerificationSupportPage /></WebsiteLayout>,
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
    path: "/payroll",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Payroll />
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
    path: "/ems",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <EMS />
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
                <TerminalComingSoon
                  title="Payer Module"
                  description="Fiat payout handling, bank allocation, settlement confirmation, and payment queue routing."
                  features={["Fiat payout handling", "Bank allocation & routing", "Settlement confirmation", "Payment queue management"]}
                />
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
        { path: "recruitment", element: <RecruitmentDashboardPage /> },
        { path: "recruitment/pipeline", element: <RecruitmentPipelinePage /> },
        { path: "recruitment/candidates", element: <CandidatesListPage /> },
        { path: "recruitment/positions", element: <PositionsPage /> },
        { path: "onboarding", element: <OnboardingPage /> },
        { path: "onboarding/stages", element: <HorillaModulePage /> },
        { path: "attendance", element: <HorillaModulePage /> },
        { path: "attendance/shifts", element: <HorillaModulePage /> },
        { path: "attendance/overtime", element: <HorillaModulePage /> },
        { path: "leave", element: <HorillaModulePage /> },
        { path: "leave/requests", element: <HorillaModulePage /> },
        { path: "leave/types", element: <HorillaModulePage /> },
        { path: "leave/holidays", element: <HorillaModulePage /> },
        { path: "payroll", element: <HorillaModulePage /> },
        { path: "payroll/payslips", element: <HorillaModulePage /> },
        { path: "payroll/allowances", element: <HorillaModulePage /> },
        { path: "payroll/deductions", element: <HorillaModulePage /> },
        { path: "asset", element: <HorillaModulePage /> },
        { path: "asset/assignments", element: <HorillaModulePage /> },
        { path: "pms", element: <HorillaModulePage /> },
        { path: "pms/objectives", element: <HorillaModulePage /> },
        { path: "pms/feedback", element: <HorillaModulePage /> },
        { path: "offboarding", element: <HorillaModulePage /> },
        { path: "helpdesk", element: <HorillaModulePage /> },
        { path: "helpdesk/faq", element: <HorillaModulePage /> },
        { path: "organization", element: <HorillaModulePage /> },
        { path: "documents", element: <HorillaModulePage /> },
        { path: "announcements", element: <HorillaModulePage /> },
        { path: "reports", element: <HorillaModulePage /> },
      ],
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
    </React.StrictMode>
  );
}

export default App;

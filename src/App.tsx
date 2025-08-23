
import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HomePage } from './components/website/pages/HomePage';
import { AboutPage } from './components/website/pages/AboutPage';
import { ContactPage } from './components/website/pages/ContactPage';
import { WebDevelopmentPage } from './components/website/pages/WebDevelopmentPage';
import { SEOServicesPage } from './components/website/pages/SEOServicesPage';
import { AppDevelopmentPage } from './components/website/pages/AppDevelopmentPage';
import { PrivacyPolicyPage } from './components/website/pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/website/pages/TermsOfServicePage';
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
import { CareersApplyPage } from './components/website/pages/CareersApplyPage';
import { BuyUSDTPage } from './components/website/pages/BuyUSDTPage';
import { CryptoFeesPage } from './components/website/pages/CryptoFeesPage';
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
import Management from './pages/Management';
import UserProfile from './pages/UserProfile';
import Banking from './pages/Banking';
import RiskManagement from './pages/RiskManagement';
import NotFound from './pages/NotFound';
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
    path: "/management",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <Management />
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
    path: "/hrms",
    element: (
      <QueryProvider>
        <AuthProvider>
          <AuthCheck>
            <Layout>
              <HRMS />
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
   // Catch-all route for 404 errors
  {
    path: "*",
    element: <NotFound />,
  },
]);

function App() {
  return (
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
}

export default App;

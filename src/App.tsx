import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AuthProvider } from '@/components/AuthProvider';
import { Layout } from '@/components/Layout';
import { PermissionGate } from '@/components/PermissionGate';
import { WebsiteLayout } from '@/components/website/WebsiteLayout';

// Import CRM pages
import Dashboard from '@/pages/Dashboard';
import Sales from '@/pages/Sales';
import Purchase from '@/pages/Purchase';
import BAMS from '@/pages/BAMS';
import Clients from '@/pages/Clients';
import ClientDetail from '@/pages/ClientDetail';
import Leads from '@/pages/Leads';
import UserManagement from '@/pages/UserManagement';
import HRMS from '@/pages/HRMS';
import Payroll from '@/pages/Payroll';
import Compliance from '@/pages/Compliance';
import StockManagement from '@/pages/StockManagement';
import Accounting from '@/pages/Accounting';
import VideoKYC from '@/pages/VideoKYC';
import KYCApprovals from '@/pages/KYCApprovals';
import Statistics from '@/pages/Statistics';
import NotFound from '@/pages/NotFound';

// Import Website pages
import { HomePage } from '@/components/website/pages/HomePage';
import { WebDevelopmentPage } from '@/components/website/pages/WebDevelopmentPage';
import { VASPPage } from '@/components/website/pages/VASPPage';
import { LoginPage } from '@/components/website/pages/LoginPage';
import { CRMDashboard } from '@/components/website/pages/CRMDashboard';
import { ContactPage } from '@/components/website/pages/ContactPage';
import { SEOServicesPage } from '@/components/website/pages/SEOServicesPage';
import { AboutPage } from '@/components/website/pages/AboutPage';
import { AppDevelopmentPage } from '@/components/website/pages/AppDevelopmentPage';

import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <div className="w-full overflow-x-hidden">
      <QueryClientProvider client={queryClient}>
        <Router>
          <Routes>
            {/* Website Routes */}
            <Route path="/website" element={<WebsiteLayout><HomePage /></WebsiteLayout>} />
            <Route path="/website/web-development" element={<WebsiteLayout><WebDevelopmentPage /></WebsiteLayout>} />
            <Route path="/website/seo-services" element={<WebsiteLayout><SEOServicesPage /></WebsiteLayout>} />
            <Route path="/website/app-development" element={<WebsiteLayout><AppDevelopmentPage /></WebsiteLayout>} />
            <Route path="/website/cloud-hosting" element={<WebsiteLayout><div className="py-20 text-center"><h1 className="text-4xl font-bold">Cloud Hosting - Coming Soon</h1></div></WebsiteLayout>} />
            <Route path="/website/software-development" element={<WebsiteLayout><div className="py-20 text-center"><h1 className="text-4xl font-bold">Software Development - Coming Soon</h1></div></WebsiteLayout>} />
            <Route path="/website/vasp" element={<WebsiteLayout><VASPPage /></WebsiteLayout>} />
            <Route path="/website/about" element={<WebsiteLayout><AboutPage /></WebsiteLayout>} />
            <Route path="/website/portfolio" element={<WebsiteLayout><div className="py-20 text-center"><h1 className="text-4xl font-bold">Portfolio - Coming Soon</h1></div></WebsiteLayout>} />
            <Route path="/website/contact" element={<WebsiteLayout><ContactPage /></WebsiteLayout>} />
            <Route path="/website/login" element={<LoginPage />} />
            <Route path="/website/crm" element={<CRMDashboard />} />

            {/* CRM Routes - Protected */}
            <Route path="/" element={
              <AuthProvider>
                <SidebarProvider>
                  <div className="min-h-screen flex w-full">
                    <Layout>
                      <Routes>
                        <Route 
                          path="/" 
                          element={
                            <PermissionGate permissions={['dashboard_view']}>
                              <Dashboard />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/sales" 
                          element={
                            <PermissionGate permissions={['sales_view', 'sales_manage']}>
                              <Sales />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/purchase" 
                          element={
                            <PermissionGate permissions={['purchase_view', 'purchase_manage']}>
                              <Purchase />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/bams" 
                          element={
                            <PermissionGate permissions={['bams_view', 'bams_manage']}>
                              <BAMS />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/clients" 
                          element={
                            <PermissionGate permissions={['clients_view', 'clients_manage']}>
                              <Clients />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/clients/:id" 
                          element={
                            <PermissionGate permissions={['clients_view', 'clients_manage']}>
                              <ClientDetail />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/leads" 
                          element={
                            <PermissionGate permissions={['leads_view', 'leads_manage']}>
                              <Leads />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/user-management" 
                          element={
                            <PermissionGate permissions={['user_management_view', 'user_management_manage']}>
                              <UserManagement />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/hrms" 
                          element={
                            <PermissionGate permissions={['hrms_view', 'hrms_manage']}>
                              <HRMS />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/payroll" 
                          element={
                            <PermissionGate permissions={['payroll_view', 'payroll_manage']}>
                              <Payroll />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/compliance" 
                          element={
                            <PermissionGate permissions={['compliance_view', 'compliance_manage']}>
                              <Compliance />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/stock" 
                          element={
                            <PermissionGate permissions={['stock_view', 'stock_manage']}>
                              <StockManagement />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/accounting" 
                          element={
                            <PermissionGate permissions={['accounting_view', 'accounting_manage']}>
                              <Accounting />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/video-kyc" 
                          element={
                            <PermissionGate permissions={['video_kyc_view', 'video_kyc_manage']}>
                              <VideoKYC />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/kyc-approvals" 
                          element={
                            <PermissionGate permissions={['kyc_approvals_view', 'kyc_approvals_manage']}>
                              <KYCApprovals />
                            </PermissionGate>
                          } 
                        />
                        <Route 
                          path="/statistics" 
                          element={
                            <PermissionGate permissions={['statistics_view', 'statistics_manage']}>
                              <Statistics />
                            </PermissionGate>
                          } 
                        />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Layout>
                  </div>
                </SidebarProvider>
              </AuthProvider>
            } />
          </Routes>
          <Toaster />
        </Router>
      </QueryClientProvider>
    </div>
  );
}

export default App;

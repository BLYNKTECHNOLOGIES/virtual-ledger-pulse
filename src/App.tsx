
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AuthProvider } from '@/components/AuthProvider';
import { Layout } from '@/components/Layout';
import { PermissionGate } from '@/components/PermissionGate';

// Import pages
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
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
        </Router>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

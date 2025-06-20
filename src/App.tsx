
import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PermissionGuard } from "./components/PermissionGuard";

// Lazy load pages for better performance
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Sales = lazy(() => import("./pages/Sales"));
const Purchase = lazy(() => import("./pages/Purchase"));
const BAMS = lazy(() => import("./pages/BAMS"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const Leads = lazy(() => import("./pages/Leads"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const HRMS = lazy(() => import("./pages/HRMS"));
const Payroll = lazy(() => import("./pages/Payroll"));
const Compliance = lazy(() => import("./pages/Compliance"));
const StockManagement = lazy(() => import("./pages/StockManagement"));
const Accounting = lazy(() => import("./pages/Accounting"));
const Login = lazy(() => import("./pages/Login"));

const queryClient = new QueryClient();

function AppContent() {
  const { isAuthenticated, login } = useAuth();

  const handleLogin = async (credentials: { username: string; password: string }) => {
    await login(credentials);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={
            isAuthenticated ? <Navigate to="/" replace /> : (
              <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
                <Login onLogin={handleLogin} />
              </Suspense>
            )
          } 
        />
        <Route
          path="/*"
          element={
            isAuthenticated ? (
              <Layout>
                <Suspense fallback={<div className="flex items-center justify-center h-64">Loading...</div>}>
                  <Routes>
                    <Route 
                      path="/" 
                      element={
                        <PermissionGuard requiredPermission="view_dashboard">
                          <Dashboard />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/sales" 
                      element={
                        <PermissionGuard requiredPermission="view_sales">
                          <Sales />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/purchase" 
                      element={
                        <PermissionGuard requiredPermission="view_purchase">
                          <Purchase />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/bams" 
                      element={
                        <PermissionGuard requiredPermission="view_bams">
                          <BAMS />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/clients" 
                      element={
                        <PermissionGuard requiredPermission="view_clients">
                          <Clients />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/clients/:id" 
                      element={
                        <PermissionGuard requiredPermission="view_clients">
                          <ClientDetail />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/leads" 
                      element={
                        <PermissionGuard requiredPermission="view_leads">
                          <Leads />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/user-management" 
                      element={
                        <PermissionGuard requiredPermission="view_user_management">
                          <UserManagement />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/hrms" 
                      element={
                        <PermissionGuard requiredPermission="view_hrms">
                          <HRMS />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/payroll" 
                      element={
                        <PermissionGuard requiredPermission="view_payroll">
                          <Payroll />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/compliance" 
                      element={
                        <PermissionGuard requiredPermission="view_compliance">
                          <Compliance />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/stock-management" 
                      element={
                        <PermissionGuard requiredPermission="view_stock_management">
                          <StockManagement />
                        </PermissionGuard>
                      } 
                    />
                    <Route 
                      path="/accounting" 
                      element={
                        <PermissionGuard requiredPermission="view_accounting">
                          <Accounting />
                        </PermissionGuard>
                      } 
                    />
                  </Routes>
                </Suspense>
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AppContent />
            <Toaster />
            <Sonner />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;


import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";

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
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/purchase" element={<Purchase />} />
                    <Route path="/bams" element={<BAMS />} />
                    <Route path="/clients" element={<Clients />} />
                    <Route path="/clients/:id" element={<ClientDetail />} />
                    <Route path="/leads" element={<Leads />} />
                    <Route path="/user-management" element={<UserManagement />} />
                    <Route path="/hrms" element={<HRMS />} />
                    <Route path="/payroll" element={<Payroll />} />
                    <Route path="/compliance" element={<Compliance />} />
                    <Route path="/stock-management" element={<StockManagement />} />
                    <Route path="/accounting" element={<Accounting />} />
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


import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "@/components/AuthProvider";
import { Layout } from "@/components/Layout";
import { ScreenShareRequestHandler } from "@/components/user-management/ScreenShareRequestHandler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import UserManagement from "./pages/UserManagement";
import ClientDetail from "./pages/ClientDetail";
import Clients from "./pages/Clients";
import Leads from "./pages/Leads";
import Sales from "./pages/Sales";
import Purchase from "./pages/Purchase";
import StockManagement from "./pages/StockManagement";
import Accounting from "./pages/Accounting";
import HRMS from "./pages/HRMS";
import Payroll from "./pages/Payroll";
import Banking from "./pages/Banking";
import BAMS from "./pages/BAMS";
import Compliance from "./pages/Compliance";
import Statistics from "./pages/Statistics";
import KYCApprovals from "./pages/KYCApprovals";
import VideoKYC from "./pages/VideoKYC";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const LayoutWrapper = () => (
  <Layout>
    <Outlet />
  </Layout>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <ScreenShareRequestHandler />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route element={<LayoutWrapper />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/user-management" element={<UserManagement />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:id" element={<ClientDetail />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/purchase" element={<Purchase />} />
                <Route path="/stock-management" element={<StockManagement />} />
                <Route path="/accounting" element={<Accounting />} />
                <Route path="/hrms" element={<HRMS />} />
                <Route path="/payroll" element={<Payroll />} />
                <Route path="/banking" element={<Banking />} />
                <Route path="/bams" element={<BAMS />} />
                <Route path="/compliance" element={<Compliance />} />
                <Route path="/statistics" element={<Statistics />} />
                <Route path="/kyc-approvals" element={<KYCApprovals />} />
                <Route path="/video-kyc" element={<VideoKYC />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

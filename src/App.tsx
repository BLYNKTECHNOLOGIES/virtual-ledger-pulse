

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import Index from "./pages/Index";
import { Login } from "./components/auth/Login";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import Purchase from "./pages/Purchase";
import BAMS from "./pages/BAMS";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Leads from "./pages/Leads";
import UserManagement from "./pages/UserManagement";
import HRMS from "./pages/HRMS";
import Payroll from "./pages/Payroll";
import Compliance from "./pages/Compliance";
import StockManagement from "./pages/StockManagement";
import Accounting from "./pages/Accounting";
import VideoKYC from "./pages/VideoKYC";
import KYCApprovals from "./pages/KYCApprovals";
import Statistics from "./pages/Statistics";
import Banking from "./pages/Banking";
import NotFound from "./pages/NotFound";

// Website Components
import { Navbar } from '@/components/website/Navbar';
import { Footer } from '@/components/website/Footer';
import { HomePage } from '@/components/website/pages/HomePage';
import { WebDesignPage } from '@/components/website/pages/WebDesignPage';
import { SEOServicesPage } from '@/components/website/pages/SEOServicesPage';
import { AppDevelopmentPage } from '@/components/website/pages/AppDevelopmentPage';
import { CloudHostingPage } from '@/components/website/pages/CloudHostingPage';
import { CustomSoftwarePage } from '@/components/website/pages/CustomSoftwarePage';
import { VASPPage } from '@/components/website/pages/VASPPage';
import { WebsiteLoginPage } from '@/components/website/pages/WebsiteLoginPage';

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ErrorBoundary>
              <Routes>
                {/* Website Routes */}
                <Route path="/website/*" element={
                  <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
                    <Navbar />
                    <main className="pt-16">
                      <Routes>
                        <Route index element={<HomePage />} />
                        <Route path="web-design" element={<WebDesignPage />} />
                        <Route path="seo-services" element={<SEOServicesPage />} />
                        <Route path="app-development" element={<AppDevelopmentPage />} />
                        <Route path="cloud-hosting" element={<CloudHostingPage />} />
                        <Route path="custom-software" element={<CustomSoftwarePage />} />
                        <Route path="vasp" element={<VASPPage />} />
                        <Route path="login" element={<WebsiteLoginPage />} />
                      </Routes>
                    </main>
                    <Footer />
                  </div>
                } />
                
                {/* CRM Routes */}
                <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
                <Route path="/sales" element={<Layout><Sales /></Layout>} />
                <Route path="/purchase" element={<Layout><Purchase /></Layout>} />
                <Route path="/bams" element={<Layout><BAMS /></Layout>} />
                <Route path="/clients" element={<Layout><Clients /></Layout>} />
                <Route path="/client/:id" element={<Layout><ClientDetail /></Layout>} />
                <Route path="/leads" element={<Layout><Leads /></Layout>} />
                <Route path="/user-management" element={<Layout><UserManagement /></Layout>} />
                <Route path="/hrms" element={<Layout><HRMS /></Layout>} />
                <Route path="/payroll" element={<Layout><Payroll /></Layout>} />
                <Route path="/compliance" element={<Layout><Compliance /></Layout>} />
                <Route path="/stock" element={<Layout><StockManagement /></Layout>} />
                <Route path="/accounting" element={<Layout><Accounting /></Layout>} />
                <Route path="/video-kyc" element={<Layout><VideoKYC /></Layout>} />
                <Route path="/kyc-approvals" element={<Layout><KYCApprovals /></Layout>} />
                <Route path="/statistics" element={<Layout><Statistics /></Layout>} />
                <Route path="/banking" element={<Layout><Banking /></Layout>} />
                <Route path="/" element={<Navigate to="/website" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;


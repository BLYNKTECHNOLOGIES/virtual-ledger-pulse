import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./components/AuthProvider";
import { lazyLoad } from "./utils/lazyLoad";
import { usePerformance } from "./hooks/usePerformance";
import { useUserActivity } from '@/hooks/useUserActivity';

// Lazy load pages for better code splitting
const Index = lazyLoad(() => import("./pages/Index"));
const Sales = lazyLoad(() => import("./pages/Sales"));
const Purchase = lazyLoad(() => import("./pages/Purchase"));
const BAMS = lazyLoad(() => import("./pages/BAMS"));
const Clients = lazyLoad(() => import("./pages/Clients"));
const ClientDetail = lazyLoad(() => import("./pages/ClientDetail"));
const Leads = lazyLoad(() => import("./pages/Leads"));
const UserManagement = lazyLoad(() => import("./pages/UserManagement"));
const HRMS = lazyLoad(() => import("./pages/HRMS"));
const Payroll = lazyLoad(() => import("./pages/Payroll"));
const Compliance = lazyLoad(() => import("./pages/Compliance"));
const StockManagement = lazyLoad(() => import("./pages/StockManagement"));
const Accounting = lazyLoad(() => import("./pages/Accounting"));
const VideoKYC = lazyLoad(() => import("./pages/VideoKYC"));
const KYCApprovals = lazyLoad(() => import("./pages/KYCApprovals"));
const Statistics = lazyLoad(() => import("./pages/Statistics"));

// Optimize QueryClient with better defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

function App() {
  usePerformance();
  useUserActivity();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <SidebarProvider>
              <Layout>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/purchase" element={<Purchase />} />
                    <Route path="/bams" element={<BAMS />} />
                    <Route path="/clients" element={<Clients />} />
                    <Route path="/clients/:clientId" element={<ClientDetail />} />
                    <Route path="/leads" element={<Leads />} />
                    <Route path="/user-management" element={<UserManagement />} />
                    <Route path="/hrms" element={<HRMS />} />
                    <Route path="/payroll" element={<Payroll />} />
                    <Route path="/compliance" element={<Compliance />} />
                    <Route path="/stock" element={<StockManagement />} />
                    <Route path="/accounting" element={<Accounting />} />
                    <Route path="/video-kyc" element={<VideoKYC />} />
                    <Route path="/kyc-approvals" element={<KYCApprovals />} />
                    <Route path="/statistics" element={<Statistics />} />
                  </Routes>
                </Suspense>
              </Layout>
            </SidebarProvider>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

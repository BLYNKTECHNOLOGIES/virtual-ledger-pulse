
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Layout } from "./components/Layout";
import Index from "./pages/Index";
import Sales from "./pages/Sales";
import Purchase from "./pages/Purchase";
import BAMS from "./pages/BAMS";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import UserManagement from "./pages/UserManagement";
import HRMS from "./pages/HRMS";
import Payroll from "./pages/Payroll";
import Compliance from "./pages/Compliance";
import StockManagement from "./pages/StockManagement";
import Accounting from "./pages/Accounting";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SidebarProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/purchase" element={<Purchase />} />
                <Route path="/bams" element={<BAMS />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:clientId" element={<ClientDetail />} />
                <Route path="/user-management" element={<UserManagement />} />
                <Route path="/hrms" element={<HRMS />} />
                <Route path="/payroll" element={<Payroll />} />
                <Route path="/compliance" element={<Compliance />} />
                <Route path="/stock" element={<StockManagement />} />
                <Route path="/accounting" element={<Accounting />} />
              </Routes>
            </Layout>
          </SidebarProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

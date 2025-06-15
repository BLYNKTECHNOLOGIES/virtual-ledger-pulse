
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import Banking from "./pages/Banking";
import Clients from "./pages/Clients";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/banking" element={<Banking />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/payment-methods" element={<div className="p-8 text-center text-gray-500">Payment Methods - Coming Soon</div>} />
            <Route path="/risk" element={<div className="p-8 text-center text-gray-500">Risk Management - Coming Soon</div>} />
            <Route path="/hrms" element={<div className="p-8 text-center text-gray-500">HRMS - Coming Soon</div>} />
            <Route path="/payroll" element={<div className="p-8 text-center text-gray-500">Payroll Management - Coming Soon</div>} />
            <Route path="/compliance" element={<div className="p-8 text-center text-gray-500">Compliance Tracking - Coming Soon</div>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;


import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useState, useEffect } from "react";
import { Login } from "@/components/auth/Login";
import { Layout } from "./components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import Index from "./pages/Index";
import Sales from "./pages/Sales";
import Purchase from "./pages/Purchase";
import BAMS from "./pages/BAMS";
import Clients from "./pages/Clients";
import HRMS from "./pages/HRMS";
import Payroll from "./pages/Payroll";
import Compliance from "./pages/Compliance";
import StockManagement from "./pages/StockManagement";
import Accounting from "./pages/Accounting";

const queryClient = new QueryClient();

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (credentials: { email: string; password: string }) => {
    // This is handled by the auth state change listener
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user || !session) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Login onLogin={handleLogin} />
          <Toaster />
          <Sonner />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

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

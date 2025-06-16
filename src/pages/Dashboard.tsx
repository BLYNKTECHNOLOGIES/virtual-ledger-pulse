
import { MetricCard } from "@/components/dashboard/MetricCard";
import { QuickAccessCard } from "@/components/dashboard/QuickAccessCard";
import { ExchangeChart } from "@/components/dashboard/ExchangeChart";
import { Banknote, User, Wallet, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const quickAccessItems = [
  { title: "Add New Client", status: "2 Pending Approvals", link: "/clients/new" },
  { title: "Home", link: "/" },
  { title: "Bank Statement", status: "Reconcile", link: "/banking" },
  { title: "Payroll", status: "Processing", link: "/payroll" },
  { title: "Compliance Tasks", count: 3, link: "/compliance" },
  { title: "Analytics Dashboard", link: "/analytics" },
];

export default function Dashboard() {
  const navigate = useNavigate();

  // Fetch inventory valuation
  const { data: inventoryData } = useQuery({
    queryKey: ['dashboard_inventory'],
    queryFn: async () => {
      const { data: products } = await supabase
        .from('products')
        .select('*');
      
      const totalValue = products?.reduce((sum, product) => {
        const buyingPrice = product.average_buying_price || product.cost_price;
        return sum + (product.current_stock_quantity * buyingPrice);
      }, 0) || 0;
      
      return { totalValue };
    },
  });

  // Fetch total clients
  const { data: clientsData } = useQuery({
    queryKey: ['dashboard_clients'],
    queryFn: async () => {
      const { data: clients } = await supabase
        .from('clients')
        .select('id');
      
      return { totalClients: clients?.length || 0 };
    },
  });

  // Fetch total bank balance
  const { data: bankData } = useQuery({
    queryKey: ['dashboard_bank_balance'],
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from('bank_accounts')
        .select('balance');
      
      const totalBalance = accounts?.reduce((sum, account) => sum + Number(account.balance), 0) || 0;
      
      return { totalBalance };
    },
  });

  // Fetch today's turnover
  const { data: turnoverData } = useQuery({
    queryKey: ['dashboard_turnover'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('amount')
        .eq('order_date', today);
      
      const { data: purchaseOrders } = await supabase
        .from('purchase_orders')
        .select('total_amount')
        .eq('order_date', today);
      
      const salesTotal = salesOrders?.reduce((sum, order) => sum + Number(order.amount), 0) || 0;
      const purchaseTotal = purchaseOrders?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      
      return { turnover: salesTotal + purchaseTotal };
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome to Blynk ERP - Your P2P Trading Management Hub</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div onClick={() => navigate('/stock')} className="cursor-pointer">
          <MetricCard
            title="Total Assets Value"
            value={`${inventoryData?.totalValue?.toLocaleString() || '0'} INR`}
            change="0% since yesterday"
            changeType="neutral"
            icon={Banknote}
          />
        </div>
        
        <div onClick={() => navigate('/clients')} className="cursor-pointer">
          <MetricCard
            title="Total Clients"
            value={clientsData?.totalClients?.toString() || '0'}
            change="↑ 1.6%"
            changeType="positive"
            subtitle="2 new clients"
            icon={User}
          />
        </div>
        
        <div onClick={() => navigate('/bams')} className="cursor-pointer">
          <MetricCard
            title="Total Cash Available"
            value={`₹${bankData?.totalBalance?.toLocaleString() || '0'}`}
            change="Available balance"
            changeType="neutral"
            icon={Wallet}
          />
        </div>
        
        <MetricCard
          title="Today's Turnover"
          value={`₹${turnoverData?.turnover?.toLocaleString() || '0'}`}
          change="Sales + Purchases"
          changeType="positive"
          subtitle="Combined daily volume"
          icon={TrendingUp}
        />
      </div>

      {/* Charts and Quick Access */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ExchangeChart />
        </div>
        <div>
          <QuickAccessCard title="Quick Access" items={quickAccessItems} />
        </div>
      </div>
    </div>
  );
}

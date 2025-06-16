
import { MetricCard } from "@/components/dashboard/MetricCard";
import { QuickAccessCard } from "@/components/dashboard/QuickAccessCard";
import { ExchangeChart } from "@/components/dashboard/ExchangeChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, User, Wallet, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const quickAccessItems = [
  { title: "Add New Client", status: "2 Pending Approvals", link: "/clients/new" },
  { title: "Home", link: "/" },
  { title: "Bank Statement", status: "Reconcile", link: "/banking" },
  { title: "Payroll", status: "Processing", link: "/payroll" },
  { title: "Compliance Tasks", count: 3, link: "/compliance" },
  { title: "Analytics Dashboard", link: "/analytics" },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function Dashboard() {
  const navigate = useNavigate();

  // Fetch inventory valuation (warehouse assets)
  const { data: inventoryData } = useQuery({
    queryKey: ['dashboard_inventory'],
    queryFn: async () => {
      const { data: products } = await supabase
        .from('products')
        .select('*, warehouses(name)');
      
      const totalValue = products?.reduce((sum, product) => {
        const buyingPrice = product.average_buying_price || product.cost_price;
        return sum + (product.current_stock_quantity * buyingPrice);
      }, 0) || 0;

      // Group by warehouse
      const warehouseBreakdown = products?.reduce((acc, product) => {
        const warehouseName = product.warehouses?.name || 'Main Warehouse';
        const value = product.current_stock_quantity * (product.average_buying_price || product.cost_price);
        acc[warehouseName] = (acc[warehouseName] || 0) + value;
        return acc;
      }, {} as Record<string, number>) || {};
      
      return { totalValue, warehouseBreakdown };
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

  // Fetch total bank balance with breakdown
  const { data: bankData } = useQuery({
    queryKey: ['dashboard_bank_balance'],
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from('bank_accounts')
        .select('account_name, bank_name, balance');
      
      const totalBalance = accounts?.reduce((sum, account) => sum + Number(account.balance), 0) || 0;
      const bankBreakdown = accounts?.map(account => ({
        name: `${account.bank_name} - ${account.account_name}`,
        value: Number(account.balance)
      })) || [];
      
      return { totalBalance, bankBreakdown };
    },
  });

  // Fetch daily sales and purchase data
  const { data: dailyData } = useQuery({
    queryKey: ['dashboard_daily_data'],
    queryFn: async () => {
      const today = new Date();
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        return date.toISOString().split('T')[0];
      }).reverse();

      const salesPromises = last7Days.map(async (date) => {
        const { data } = await supabase
          .from('sales_orders')
          .select('amount')
          .eq('order_date', date);
        return data?.reduce((sum, order) => sum + Number(order.amount), 0) || 0;
      });

      const purchasePromises = last7Days.map(async (date) => {
        const { data } = await supabase
          .from('purchase_orders')
          .select('total_amount')
          .eq('order_date', date);
        return data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      });

      const salesData = await Promise.all(salesPromises);
      const purchaseData = await Promise.all(purchasePromises);

      const chartData = last7Days.map((date, index) => ({
        date: new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        sales: salesData[index],
        purchases: purchaseData[index]
      }));

      const todayTurnover = salesData[salesData.length - 1] + purchaseData[purchaseData.length - 1];

      return { chartData, todayTurnover };
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome to Blynk ERP - Leading Virtual Asset Service Provider</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div onClick={() => navigate('/stock')} className="cursor-pointer">
          <MetricCard
            title="Total Assets Value"
            value={`₹${inventoryData?.totalValue?.toLocaleString() || '0'}`}
            change="Inventory Valuation"
            changeType="neutral"
            icon={Banknote}
          />
        </div>
        
        <div onClick={() => navigate('/clients')} className="cursor-pointer">
          <MetricCard
            title="Total Clients"
            value={clientsData?.totalClients?.toString() || '0'}
            change="Active Clients"
            changeType="positive"
            subtitle="Registered users"
            icon={User}
          />
        </div>
        
        <div onClick={() => navigate('/bams')} className="cursor-pointer">
          <MetricCard
            title="Total Cash Available"
            value={`₹${bankData?.totalBalance?.toLocaleString() || '0'}`}
            change="All Bank Accounts"
            changeType="neutral"
            icon={Wallet}
          />
        </div>
        
        <MetricCard
          title="Today's Turnover"
          value={`₹${dailyData?.todayTurnover?.toLocaleString() || '0'}`}
          change="Sales + Purchases"
          changeType="positive"
          subtitle="Combined daily volume"
          icon={TrendingUp}
        />
      </div>

      {/* Asset Breakdown Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Asset Breakdown by Warehouse</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(inventoryData?.warehouseBreakdown || {}).map(([warehouse, value]) => (
                <div key={warehouse} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{warehouse}</span>
                  <span className="font-medium">₹{value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Daily Sales & Purchase Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              Sales & Purchases - Daily View
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData?.chartData || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString()}`, '']} />
                <Bar dataKey="sales" fill="#10B981" />
                <Bar dataKey="purchases" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cash Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              Cash Distribution - By Bank
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={bankData?.bankBreakdown || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  dataKey="value"
                >
                  {bankData?.bankBreakdown?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString()}`, 'Balance']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-1">
              {bankData?.bankBreakdown?.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-gray-600 truncate">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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

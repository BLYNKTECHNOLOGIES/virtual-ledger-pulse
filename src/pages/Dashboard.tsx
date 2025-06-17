
import { MetricCard } from "@/components/dashboard/MetricCard";
import { QuickAccessCard } from "@/components/dashboard/QuickAccessCard";
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

      return { totalValue };
    },
  });

  // Fetch warehouse stock data for chart - stock levels not valuation
  const { data: warehouseStockData } = useQuery({
    queryKey: ['dashboard_warehouse_stock'],
    queryFn: async () => {
      const { data: warehouses } = await supabase
        .from('warehouses')
        .select('id, name')
        .eq('is_active', true);

      if (!warehouses) return [];

      const warehouseStockPromises = warehouses.map(async (warehouse) => {
        const { data: products } = await supabase
          .from('products')
          .select('current_stock_quantity')
          .eq('warehouse_id', warehouse.id);

        const totalStock = products?.reduce((sum, product) => sum + product.current_stock_quantity, 0) || 0;
        
        return {
          name: warehouse.name,
          stock: totalStock
        };
      });

      const warehouseStock = await Promise.all(warehouseStockPromises);
      return warehouseStock;
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
    <div className="space-y-6 p-6">
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

        {/* Quick Access - Moved to third column */}
        <QuickAccessCard title="Quick Access" items={quickAccessItems} />
      </div>

      {/* Warehouse Stock Chart - Above Quick Access section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Warehouse Stock Breakdown</h3>
              <span className="text-sm text-gray-500">Current Stock Levels</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={warehouseStockData || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} units`, 'Stock']} />
                  <Bar dataKey="stock" fill="#ec4899" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

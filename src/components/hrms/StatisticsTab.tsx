import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend } from "recharts";
import { 
  TrendingUp, Users, DollarSign, ShoppingCart, Building, 
  FileBarChart, UserCheck, Download, BarChart3, ArrowUp, ArrowDown, Briefcase,
  Target, UserPlus, Clock, CheckCircle, XCircle, AlertCircle, Phone, Award, Star
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";
import { format, startOfMonth, endOfMonth, subMonths, subDays, differenceInDays, startOfDay, endOfDay } from "date-fns";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(142, 76%, 36%)", // green
  "hsl(45, 93%, 47%)",  // yellow
  "hsl(0, 84%, 60%)",   // red
  "hsl(262, 83%, 58%)", // purple
  "hsl(199, 89%, 48%)", // blue
  "hsl(25, 95%, 53%)",  // orange
];

export function StatisticsTab() {
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last30days");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("last30days"));
  const [activeTab, setActiveTab] = useState("overview");

  const getDateRange = () => {
    if (dateRange?.from && dateRange?.to) {
      return { startDate: dateRange.from, endDate: dateRange.to };
    }
    const now = new Date();
    return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
  };

  // Fetch comprehensive statistics data
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['statistics_dashboard_enhanced', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      // Get previous period for comparison
      const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - periodDays);
      const prevEndDate = new Date(startDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevStartStr = format(prevStartDate, 'yyyy-MM-dd');
      const prevEndStr = format(prevEndDate, 'yyyy-MM-dd');

      // Fetch sales orders with client info
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('id, total_amount, order_date, status, payment_status, quantity, price_per_unit, client_name')
        .gte('order_date', startStr)
        .lte('order_date', endStr);

      // Fetch previous period sales
      const { data: prevSalesOrders } = await supabase
        .from('sales_orders')
        .select('id, total_amount')
        .gte('order_date', prevStartStr)
        .lte('order_date', prevEndStr);

      // Fetch purchase orders
      const { data: purchaseOrders } = await supabase
        .from('purchase_orders')
        .select('id, total_amount, order_date, status, supplier_name, created_by')
        .gte('order_date', startStr)
        .lte('order_date', endStr);

      // Fetch purchase order items
      const { data: purchaseOrderItems } = await supabase
        .from('purchase_order_items')
        .select('purchase_order_id, quantity, unit_price');

      // Fetch ALL clients to track new additions
      const { data: allClients } = await supabase
        .from('clients')
        .select('id, created_at, kyc_status, client_type, name, date_of_onboarding, is_buyer, is_seller, buyer_approval_status, seller_approval_status, assigned_operator');

      // Clients created in this period (new clients)
      const newClientsInPeriod = allClients?.filter(c => {
        const createdDate = new Date(c.created_at);
        return createdDate >= startDate && createdDate <= endDate;
      }) || [];

      // Clients from previous period
      const newClientsInPrevPeriod = allClients?.filter(c => {
        const createdDate = new Date(c.created_at);
        return createdDate >= prevStartDate && createdDate <= prevEndDate;
      }) || [];

      // Fetch leads
      const { data: leads } = await supabase
        .from('leads')
        .select('id, status, created_at, name, lead_type, estimated_order_value, contact_channel');

      // Leads in current period
      const leadsInPeriod = leads?.filter(l => {
        const createdDate = new Date(l.created_at);
        return createdDate >= startDate && createdDate <= endDate;
      }) || [];

      // Leads in previous period
      const leadsInPrevPeriod = leads?.filter(l => {
        const createdDate = new Date(l.created_at);
        return createdDate >= prevStartDate && createdDate <= prevEndDate;
      }) || [];

      // Fetch employees
      const { data: employees } = await supabase
        .from('employees')
        .select('id, name, department, status, salary, created_at, designation, email');

      // Fetch client onboarding approvals
      const { data: onboardingApprovals } = await supabase
        .from('client_onboarding_approvals')
        .select('id, approval_status, created_at, reviewed_at, client_name, order_amount');

      // Onboarding in period
      const onboardingInPeriod = onboardingApprovals?.filter(a => {
        const createdDate = new Date(a.created_at);
        return createdDate >= startDate && createdDate <= endDate;
      }) || [];

      // Fetch operating expenses
      const { data: expenses } = await supabase
        .from('bank_transactions')
        .select('id, amount, category, transaction_date')
        .eq('transaction_type', 'EXPENSE')
        .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading")')
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr);

      // Calculate core KPIs
      const currentRevenue = salesOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      const prevRevenue = prevSalesOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

      const totalTrades = (salesOrders?.length || 0) + (purchaseOrders?.length || 0);
      const totalClients = allClients?.length || 0;
      const totalEmployees = employees?.filter(e => e.status === 'ACTIVE')?.length || 0;

      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;

      // Calculate profit metrics
      const purchaseOrderIds = purchaseOrders?.map(po => po.id) || [];
      const relevantPurchaseItems = purchaseOrderItems?.filter(item => 
        purchaseOrderIds.includes(item.purchase_order_id)
      ) || [];
      
      const totalPurchasedQuantity = relevantPurchaseItems.reduce((sum, item) => 
        sum + Number(item.quantity || 0), 0);
      const totalPurchaseCost = relevantPurchaseItems.reduce((sum, item) => 
        sum + (Number(item.quantity || 0) * Number(item.unit_price || 0)), 0);
      
      const avgPurchaseCostPerUnit = totalPurchasedQuantity > 0 
        ? totalPurchaseCost / totalPurchasedQuantity 
        : 0;

      const totalSoldQuantity = salesOrders?.reduce((sum, o) => sum + Number(o.quantity || 0), 0) || 0;
      const avgSalesPricePerUnit = totalSoldQuantity > 0 
        ? currentRevenue / totalSoldQuantity 
        : 0;

      const netProfitMarginPerUnit = avgSalesPricePerUnit - avgPurchaseCostPerUnit;
      const netProfit = netProfitMarginPerUnit * totalSoldQuantity;

      // ===== KYC & CLIENT STATISTICS =====
      const kycVerified = allClients?.filter(c => c.kyc_status === 'VERIFIED' || c.kyc_status === 'APPROVED')?.length || 0;
      const kycPending = allClients?.filter(c => c.kyc_status === 'PENDING')?.length || 0;
      const kycRejected = allClients?.filter(c => c.kyc_status === 'REJECTED')?.length || 0;
      
      // New KYC verified in period
      const newKycVerifiedInPeriod = newClientsInPeriod.filter(c => 
        c.kyc_status === 'VERIFIED' || c.kyc_status === 'APPROVED'
      ).length;

      // Buyer/Seller stats
      const buyersTotal = allClients?.filter(c => c.is_buyer)?.length || 0;
      const sellersTotal = allClients?.filter(c => c.is_seller)?.length || 0;
      const newBuyers = newClientsInPeriod.filter(c => c.is_buyer).length;
      const newSellers = newClientsInPeriod.filter(c => c.is_seller).length;

      // ===== LEAD STATISTICS =====
      const newLeads = leadsInPeriod.length;
      const prevNewLeads = leadsInPrevPeriod.length;
      const leadsChange = prevNewLeads > 0 ? ((newLeads - prevNewLeads) / prevNewLeads) * 100 : 0;

      const convertedLeads = leadsInPeriod.filter(l => l.status === 'CONVERTED').length;
      const openLeads = leads?.filter(l => l.status === 'NEW' || l.status === 'CONTACTED' || l.status === 'FOLLOW_UP').length || 0;
      const lostLeads = leadsInPeriod.filter(l => l.status === 'LOST').length;
      
      const conversionRate = newLeads > 0 ? (convertedLeads / newLeads) * 100 : 0;

      // Lead sources breakdown
      const leadSources = new Map<string, { count: number; converted: number }>();
      leadsInPeriod.forEach(lead => {
        const source = lead.contact_channel || 'Direct';
        if (!leadSources.has(source)) {
          leadSources.set(source, { count: 0, converted: 0 });
        }
        const current = leadSources.get(source)!;
        current.count++;
        if (lead.status === 'CONVERTED') current.converted++;
      });

      const leadSourceData = Array.from(leadSources.entries()).map(([name, data]) => ({
        name,
        leads: data.count,
        converted: data.converted,
        rate: data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0
      })).sort((a, b) => b.leads - a.leads);

      // ===== ONBOARDING STATISTICS =====
      const pendingOnboarding = onboardingInPeriod.filter(a => a.approval_status === 'PENDING').length;
      const approvedOnboarding = onboardingInPeriod.filter(a => a.approval_status === 'APPROVED').length;
      const rejectedOnboarding = onboardingInPeriod.filter(a => a.approval_status === 'REJECTED').length;
      const totalOnboardingValue = onboardingInPeriod
        .filter(a => a.approval_status === 'APPROVED')
        .reduce((sum, a) => sum + Number(a.order_amount || 0), 0);

      // ===== EMPLOYEE PERFORMANCE (Prepared for future) =====
      // Group by assigned_operator for client additions
      const operatorClientStats = new Map<string, { clientsAdded: number; ordersHandled: number; revenue: number }>();
      
      newClientsInPeriod.forEach(client => {
        const operator = client.assigned_operator || 'Unassigned';
        if (!operatorClientStats.has(operator)) {
          operatorClientStats.set(operator, { clientsAdded: 0, ordersHandled: 0, revenue: 0 });
        }
        operatorClientStats.get(operator)!.clientsAdded++;
      });

      // Track orders - future enhancement when created_by is linked to employees
      // For now, we'll prepare the structure but not track by individual
      const totalOrdersHandled = salesOrders?.length || 0;
      const totalRevenueGenerated = salesOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;

      const employeePerformanceData = Array.from(operatorClientStats.entries())
        .filter(([name]) => name !== 'System' && name !== 'Unassigned')
        .map(([name, data]) => ({
          name: name.split('@')[0] || name,
          clientsAdded: data.clientsAdded,
          ordersHandled: data.ordersHandled,
          revenue: data.revenue
        }))
        .sort((a, b) => b.revenue - a.revenue);

      // ===== MONTHLY TRENDS =====
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        const monthEnd = endOfMonth(subMonths(new Date(), i));
        const monthStartStr = format(monthStart, 'yyyy-MM-dd');
        const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
        
        const monthSales = salesOrders?.filter(o => 
          o.order_date >= monthStartStr && o.order_date <= monthEndStr
        ) || [];
        const monthPurchases = purchaseOrders?.filter(o => 
          o.order_date >= monthStartStr && o.order_date <= monthEndStr
        ) || [];

        const monthNewClients = allClients?.filter(c => {
          const created = format(new Date(c.created_at), 'yyyy-MM-dd');
          return created >= monthStartStr && created <= monthEndStr;
        }) || [];

        const monthLeads = leads?.filter(l => {
          const created = format(new Date(l.created_at), 'yyyy-MM-dd');
          return created >= monthStartStr && created <= monthEndStr;
        }) || [];

        const monthConvertedLeads = monthLeads.filter(l => l.status === 'CONVERTED').length;

        const monthRevenue = monthSales.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

        monthlyData.push({
          month: format(monthStart, 'MMM'),
          trades: monthSales.length + monthPurchases.length,
          revenue: monthRevenue,
          newClients: monthNewClients.length,
          newLeads: monthLeads.length,
          convertedLeads: monthConvertedLeads
        });
      }

      // Department distribution
      const departmentCounts = new Map<string, number>();
      employees?.filter(e => e.status === 'ACTIVE')?.forEach(emp => {
        const dept = emp.department || 'Other';
        departmentCounts.set(dept, (departmentCounts.get(dept) || 0) + 1);
      });
      const departmentData = Array.from(departmentCounts.entries()).map(([name, count]) => ({
        name,
        count
      }));

      // Expense breakdown by category
      const expenseByCategory = new Map<string, number>();
      expenses?.forEach(exp => {
        const cat = exp.category || 'Other';
        expenseByCategory.set(cat, (expenseByCategory.get(cat) || 0) + Number(exp.amount || 0));
      });
      const expenseBreakdown = Array.from(expenseByCategory.entries())
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      // Top clients by volume
      const clientVolumes = new Map<string, { name: string; volume: number; trades: number }>();
      salesOrders?.forEach(order => {
        const clientName = order.client_name || 'Unknown';
        if (!clientVolumes.has(clientName)) {
          clientVolumes.set(clientName, { name: clientName, volume: 0, trades: 0 });
        }
        const stats = clientVolumes.get(clientName)!;
        stats.volume += Number(order.total_amount || 0);
        stats.trades++;
      });
      const topClients = Array.from(clientVolumes.values())
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);

      return {
        kpi: {
          revenue: currentRevenue,
          revenueChange,
          clients: totalClients,
          trades: totalTrades,
          employees: totalEmployees,
          profit: netProfit
        },
        clientStats: {
          total: totalClients,
          newInPeriod: newClientsInPeriod.length,
          newInPrevPeriod: newClientsInPrevPeriod.length,
          buyers: buyersTotal,
          sellers: sellersTotal,
          newBuyers,
          newSellers
        },
        kycStats: {
          verified: kycVerified,
          pending: kycPending,
          rejected: kycRejected,
          newVerifiedInPeriod: newKycVerifiedInPeriod,
          verificationRate: totalClients > 0 ? Math.round((kycVerified / totalClients) * 100) : 0
        },
        leadStats: {
          total: leads?.length || 0,
          newInPeriod: newLeads,
          converted: convertedLeads,
          open: openLeads,
          lost: lostLeads,
          conversionRate,
          leadsChange,
          leadSourceData
        },
        onboardingStats: {
          pending: pendingOnboarding,
          approved: approvedOnboarding,
          rejected: rejectedOnboarding,
          totalValue: totalOnboardingValue
        },
        employeePerformance: employeePerformanceData,
        monthlyData,
        departmentData,
        expenseBreakdown,
        topClients,
        totalExpenses,
        totalSalary: employees?.filter(e => e.status === 'ACTIVE')?.reduce((sum, e) => sum + Number(e.salary || 0), 0) || 0
      };
    },
  });

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(2)}`;
  };

  const formatNumber = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading statistics...</p>
        </div>
      </div>
    );
  }

  const { 
    kpi, clientStats, kycStats, leadStats, onboardingStats, 
    employeePerformance, monthlyData, departmentData, expenseBreakdown, 
    topClients, totalExpenses, totalSalary 
  } = statsData || {
    kpi: { revenue: 0, revenueChange: 0, clients: 0, trades: 0, employees: 0, profit: 0 },
    clientStats: { total: 0, newInPeriod: 0, newInPrevPeriod: 0, buyers: 0, sellers: 0, newBuyers: 0, newSellers: 0 },
    kycStats: { verified: 0, pending: 0, rejected: 0, newVerifiedInPeriod: 0, verificationRate: 0 },
    leadStats: { total: 0, newInPeriod: 0, converted: 0, open: 0, lost: 0, conversionRate: 0, leadsChange: 0, leadSourceData: [] },
    onboardingStats: { pending: 0, approved: 0, rejected: 0, totalValue: 0 },
    employeePerformance: [],
    monthlyData: [],
    departmentData: [],
    expenseBreakdown: [],
    topClients: [],
    totalExpenses: 0,
    totalSalary: 0
  };

  const clientGrowthChange = clientStats.newInPrevPeriod > 0 
    ? ((clientStats.newInPeriod - clientStats.newInPrevPeriod) / clientStats.newInPrevPeriod) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header with Title and Date Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Statistics & Analytics</h1>
            <p className="text-muted-foreground text-sm">Comprehensive business insights and growth metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            preset={datePreset}
            onPresetChange={setDatePreset}
            className="min-w-[200px]"
          />
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="shadow-md border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-xs font-medium">Revenue</p>
                <p className="text-xl font-bold">{formatCurrency(kpi.revenue)}</p>
                <div className="flex items-center mt-1">
                  {kpi.revenueChange >= 0 ? (
                    <><ArrowUp className="h-3 w-3 mr-1" /><span className="text-xs">+{kpi.revenueChange.toFixed(1)}%</span></>
                  ) : (
                    <><ArrowDown className="h-3 w-3 mr-1" /><span className="text-xs">{kpi.revenueChange.toFixed(1)}%</span></>
                  )}
                </div>
              </div>
              <DollarSign className="h-8 w-8 text-emerald-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-xs font-medium">New Clients</p>
                <p className="text-xl font-bold">{clientStats.newInPeriod}</p>
                <div className="flex items-center mt-1">
                  {clientGrowthChange >= 0 ? (
                    <><ArrowUp className="h-3 w-3 mr-1" /><span className="text-xs">+{clientGrowthChange.toFixed(0)}%</span></>
                  ) : (
                    <><ArrowDown className="h-3 w-3 mr-1" /><span className="text-xs">{clientGrowthChange.toFixed(0)}%</span></>
                  )}
                </div>
              </div>
              <UserPlus className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-xs font-medium">KYC Verified</p>
                <p className="text-xl font-bold">{kycStats.newVerifiedInPeriod}</p>
                <p className="text-xs text-purple-200 mt-1">{kycStats.verificationRate}% total rate</p>
              </div>
              <UserCheck className="h-8 w-8 text-purple-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0 bg-gradient-to-br from-amber-500 to-amber-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-xs font-medium">New Leads</p>
                <p className="text-xl font-bold">{leadStats.newInPeriod}</p>
                <div className="flex items-center mt-1">
                  {leadStats.leadsChange >= 0 ? (
                    <><ArrowUp className="h-3 w-3 mr-1" /><span className="text-xs">+{leadStats.leadsChange.toFixed(0)}%</span></>
                  ) : (
                    <><ArrowDown className="h-3 w-3 mr-1" /><span className="text-xs">{leadStats.leadsChange.toFixed(0)}%</span></>
                  )}
                </div>
              </div>
              <Target className="h-8 w-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0 bg-gradient-to-br from-teal-500 to-teal-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-teal-100 text-xs font-medium">Conversion Rate</p>
                <p className="text-xl font-bold">{leadStats.conversionRate.toFixed(1)}%</p>
                <p className="text-xs text-teal-200 mt-1">{leadStats.converted} converted</p>
              </div>
              <CheckCircle className="h-8 w-8 text-teal-200" />
            </div>
          </CardContent>
        </Card>

        <Card className={`shadow-md border-0 text-white ${kpi.profit >= 0 ? 'bg-gradient-to-br from-green-500 to-green-600' : 'bg-gradient-to-br from-red-500 to-red-600'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-xs font-medium">Net Profit</p>
                <p className="text-xl font-bold">{formatCurrency(Math.abs(kpi.profit))}</p>
                <p className="text-xs text-white/70 mt-1">{kpi.profit >= 0 ? 'Profit' : 'Loss'}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-white/60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Different Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full overflow-x-auto gap-1 mb-6 md:grid md:grid-cols-5">
          <TabsTrigger value="overview" className="text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">Overview</TabsTrigger>
          <TabsTrigger value="clients" className="text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">Clients & KYC</TabsTrigger>
          <TabsTrigger value="leads" className="text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">Leads</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">Performance</TabsTrigger>
          <TabsTrigger value="financial" className="text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">Financial</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Growth Trends Chart */}
            <Card className="shadow-lg border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Growth Trends (6 Months)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Legend />
                    <Line type="monotone" dataKey="newClients" stroke="hsl(var(--primary))" strokeWidth={2} name="New Clients" />
                    <Line type="monotone" dataKey="newLeads" stroke="hsl(45, 93%, 47%)" strokeWidth={2} name="New Leads" />
                    <Line type="monotone" dataKey="convertedLeads" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Converted" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue Chart */}
            <Card className="shadow-lg border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                  Revenue & Trades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(142, 76%, 36%)" fill="hsl(142, 76%, 36%)" fillOpacity={0.3} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card className="shadow-md">
              <CardContent className="p-4 text-center">
                <Users className="h-6 w-6 mx-auto text-primary mb-2" />
                <p className="text-2xl font-bold">{clientStats.total}</p>
                <p className="text-xs text-muted-foreground">Total Clients</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4 text-center">
                <ShoppingCart className="h-6 w-6 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold">{kpi.trades}</p>
                <p className="text-xs text-muted-foreground">Trades</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4 text-center">
                <Target className="h-6 w-6 mx-auto text-amber-600 mb-2" />
                <p className="text-2xl font-bold">{leadStats.open}</p>
                <p className="text-xs text-muted-foreground">Open Leads</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4 text-center">
                <Clock className="h-6 w-6 mx-auto text-orange-600 mb-2" />
                <p className="text-2xl font-bold">{onboardingStats.pending}</p>
                <p className="text-xs text-muted-foreground">Pending KYC</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4 text-center">
                <Briefcase className="h-6 w-6 mx-auto text-purple-600 mb-2" />
                <p className="text-2xl font-bold">{kpi.employees}</p>
                <p className="text-xs text-muted-foreground">Employees</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4 text-center">
                <Building className="h-6 w-6 mx-auto text-teal-600 mb-2" />
                <p className="text-2xl font-bold">{departmentData.length}</p>
                <p className="text-xs text-muted-foreground">Departments</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clients & KYC Tab */}
        <TabsContent value="clients" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-md bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">New Clients</p>
                    <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{clientStats.newInPeriod}</p>
                    <p className="text-xs text-blue-500 mt-1">This period</p>
                  </div>
                  <UserPlus className="h-10 w-10 text-blue-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">KYC Verified</p>
                    <p className="text-3xl font-bold text-green-700 dark:text-green-300">{kycStats.verified}</p>
                    <p className="text-xs text-green-500 mt-1">{kycStats.newVerifiedInPeriod} new this period</p>
                  </div>
                  <CheckCircle className="h-10 w-10 text-green-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">Pending KYC</p>
                    <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{kycStats.pending}</p>
                    <p className="text-xs text-amber-500 mt-1">Awaiting verification</p>
                  </div>
                  <AlertCircle className="h-10 w-10 text-amber-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">Rejected</p>
                    <p className="text-3xl font-bold text-red-700 dark:text-red-300">{kycStats.rejected}</p>
                    <p className="text-xs text-red-500 mt-1">Failed verification</p>
                  </div>
                  <XCircle className="h-10 w-10 text-red-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* KYC Status Pie Chart */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  KYC Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Verified", value: kycStats.verified },
                        { name: "Pending", value: kycStats.pending },
                        { name: "Rejected", value: kycStats.rejected }
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      <Cell fill="hsl(142, 76%, 36%)" />
                      <Cell fill="hsl(45, 93%, 47%)" />
                      <Cell fill="hsl(0, 84%, 60%)" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Client Type Breakdown */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Client Type Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Buyers</p>
                    <p className="text-2xl font-bold text-blue-600">{clientStats.buyers}</p>
                    <Badge variant="secondary" className="mt-2">+{clientStats.newBuyers} new</Badge>
                  </div>
                  <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Sellers</p>
                    <p className="text-2xl font-bold text-purple-600">{clientStats.sellers}</p>
                    <Badge variant="secondary" className="mt-2">+{clientStats.newSellers} new</Badge>
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Verification Rate</span>
                    <span className="text-lg font-bold text-green-600">{kycStats.verificationRate}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 mt-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full" 
                      style={{ width: `${kycStats.verificationRate}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Leads Tab */}
        <TabsContent value="leads" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">New Leads</p>
                    <p className="text-2xl font-bold">{leadStats.newInPeriod}</p>
                  </div>
                  <Target className="h-8 w-8 text-amber-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Open Leads</p>
                    <p className="text-2xl font-bold">{leadStats.open}</p>
                  </div>
                  <Clock className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Converted</p>
                    <p className="text-2xl font-bold text-green-600">{leadStats.converted}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Lost</p>
                    <p className="text-2xl font-bold text-red-600">{leadStats.lost}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-md bg-gradient-to-br from-teal-500 to-teal-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-teal-100 text-sm">Conversion Rate</p>
                    <p className="text-2xl font-bold">{leadStats.conversionRate.toFixed(1)}%</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-teal-200" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lead Sources */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  Lead Sources Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leadStats.leadSourceData.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-center">Leads</TableHead>
                        <TableHead className="text-center">Converted</TableHead>
                        <TableHead className="text-right">Conv. Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leadStats.leadSourceData.slice(0, 6).map((source) => (
                        <TableRow key={source.name}>
                          <TableCell className="font-medium">{source.name}</TableCell>
                          <TableCell className="text-center">{source.leads}</TableCell>
                          <TableCell className="text-center text-green-600">{source.converted}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={source.rate >= 50 ? "default" : source.rate >= 25 ? "secondary" : "outline"}>
                              {source.rate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No lead data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lead Trend Chart */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Lead Conversion Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Legend />
                    <Bar dataKey="newLeads" fill="hsl(45, 93%, 47%)" name="New Leads" />
                    <Bar dataKey="convertedLeads" fill="hsl(142, 76%, 36%)" name="Converted" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                Employee Performance Tracking
                <Badge variant="outline" className="ml-2">Coming Soon</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {employeePerformance.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-center">Clients Added</TableHead>
                      <TableHead className="text-center">Orders Handled</TableHead>
                      <TableHead className="text-right">Revenue Generated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeePerformance.map((emp, index) => (
                      <TableRow key={emp.name}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {index < 3 && <Star className="h-4 w-4 text-amber-500" />}
                            {emp.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{emp.clientsAdded}</TableCell>
                        <TableCell className="text-center">{emp.ordersHandled}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatCurrency(emp.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-12 text-center space-y-4">
                  <Briefcase className="h-16 w-16 mx-auto text-muted-foreground/50" />
                  <div>
                    <p className="font-medium text-muted-foreground">Employee Performance Tracking</p>
                    <p className="text-sm text-muted-foreground">
                      Once employees are linked to orders and client assignments, their performance metrics will appear here.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto mt-6">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <UserPlus className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                      <p className="text-sm font-medium">Clients Added</p>
                      <p className="text-xs text-muted-foreground">Track new client acquisitions</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <ShoppingCart className="h-6 w-6 mx-auto text-purple-500 mb-2" />
                      <p className="text-sm font-medium">Orders Handled</p>
                      <p className="text-xs text-muted-foreground">Monitor order processing</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <DollarSign className="h-6 w-6 mx-auto text-green-500 mb-2" />
                      <p className="text-sm font-medium">Revenue Generated</p>
                      <p className="text-xs text-muted-foreground">Measure contribution</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Clients */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Top Clients by Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topClients.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Client Name</TableHead>
                      <TableHead className="text-center">Trades</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topClients.map((client, index) => (
                      <TableRow key={client.name}>
                        <TableCell>
                          <Badge variant={index < 3 ? "default" : "secondary"}>#{index + 1}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{client.name}</TableCell>
                        <TableCell className="text-center">{client.trades}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(client.volume)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No client data available for this period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-md">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(kpi.revenue)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Operating Expenses</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-2xl font-bold ${kpi.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(kpi.profit)}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Monthly Salary</p>
                <p className="text-2xl font-bold">{formatCurrency(totalSalary)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expense Breakdown */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileBarChart className="h-5 w-5 text-red-600" />
                  Expense Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {expenseBreakdown.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenseBreakdown.slice(0, 8).map((expense) => (
                        <TableRow key={expense.category}>
                          <TableCell className="font-medium">{expense.category}</TableCell>
                          <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                          <TableCell className="text-right">{expense.percentage}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No expenses in selected period
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Department Distribution */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building className="h-5 w-5 text-orange-600" />
                  Department Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {departmentData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={departmentData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                      <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" width={100} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="Employees" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No employee data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

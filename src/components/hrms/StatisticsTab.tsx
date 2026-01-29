
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from "recharts";
import { 
  TrendingUp, Users, DollarSign, ShoppingCart, Building, 
  FileBarChart, Shield, AlertTriangle, UserCheck, Clock,
  Download, BarChart3, PieChart as PieChartIcon, Calendar,
  Activity, ArrowUp, ArrowDown, MapPin, Star, Briefcase
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";

// Mock data for comprehensive analytics
const kpiData = {
  revenue: { value: "₹2.4M", change: "+18.7%", trend: "up" },
  users: { value: "12.4K", change: "+22.3%", trend: "up" },
  trades: { value: "3,456", change: "+15.8%", trend: "up" },
  employees: { value: "127", change: "+8.4%", trend: "up" },
  profit: { value: "₹847K", change: "+12.5%", trend: "up" }
};

const tradingData = [
  { month: "Jan", buyOrders: 245, sellOrders: 198, completed: 420, cancelled: 23, avgTime: 18 },
  { month: "Feb", buyOrders: 289, sellOrders: 234, completed: 498, cancelled: 25, avgTime: 16 },
  { month: "Mar", buyOrders: 356, sellOrders: 287, completed: 612, cancelled: 31, avgTime: 15 },
  { month: "Apr", buyOrders: 398, sellOrders: 334, completed: 698, cancelled: 34, avgTime: 17 },
  { month: "May", buyOrders: 434, sellOrders: 389, completed: 789, cancelled: 34, avgTime: 14 },
  { month: "Jun", buyOrders: 467, sellOrders: 423, completed: 856, cancelled: 34, avgTime: 13 }
];

const financialData = [
  { month: "Jan", revenue: 1245000, grossProfit: 356000, netProfit: 234000, expenses: 122000 },
  { month: "Feb", revenue: 1456000, grossProfit: 423000, netProfit: 287000, expenses: 136000 },
  { month: "Mar", revenue: 1587000, grossProfit: 487000, netProfit: 334000, expenses: 153000 },
  { month: "Apr", revenue: 1823000, grossProfit: 556000, netProfit: 398000, expenses: 158000 },
  { month: "May", revenue: 2045000, grossProfit: 634000, netProfit: 467000, expenses: 167000 },
  { month: "Jun", revenue: 2234000, grossProfit: 698000, netProfit: 523000, expenses: 175000 }
];

const assetProfitData = [
  { name: "USDT", value: 45, color: "hsl(var(--success))" },
  { name: "BTC", value: 32, color: "hsl(var(--crypto-bitcoin))" },
  { name: "ETH", value: 18, color: "hsl(var(--crypto-ethereum))" },
  { name: "Others", value: 5, color: "hsl(var(--muted-foreground))" }
];

const complianceData = {
  kyc: { pending: 45, approved: 867, rejected: 23, total: 935 },
  suspicious: 12,
  appeals: { raised: 8, resolved: 6 },
  riskLevels: [
    { level: "Low", count: 542, color: "hsl(var(--success))" },
    { level: "Medium", count: 234, color: "hsl(var(--warning))" },
    { level: "High", count: 67, color: "hsl(var(--destructive))" }
  ]
};

const customerData = [
  { month: "Jan", dau: 2134, mau: 8923, registrations: 234, retention: 68.4 },
  { month: "Feb", dau: 2456, mau: 9567, registrations: 267, retention: 71.2 },
  { month: "Mar", dau: 2789, mau: 10234, registrations: 298, retention: 73.8 },
  { month: "Apr", dau: 3123, mau: 11045, registrations: 334, retention: 76.1 },
  { month: "May", dau: 3456, mau: 11823, registrations: 387, retention: 78.5 },
  { month: "Jun", dau: 3789, mau: 12456, registrations: 423, retention: 80.2 }
];

const employeeData = {
  total: 127,
  departments: [
    { name: "Engineering", count: 45, color: "hsl(var(--primary))" },
    { name: "Sales", count: 23, color: "hsl(var(--success))" },
    { name: "Compliance", count: 18, color: "hsl(var(--warning))" },
    { name: "Operations", count: 25, color: "hsl(var(--info))" },
    { name: "Finance", count: 16, color: "hsl(var(--destructive))" }
  ],
  salaryExpenditure: {
    monthly: 2340000,
    yearly: 28080000
  },
  interviews: {
    conducted: 34,
    selected: 8,
    rejected: 18,
    pending: 8
  }
};

const expenseBreakdown = [
  { category: "Salaries", amount: 2340000, percentage: 68 },
  { category: "Technology", amount: 456000, percentage: 13 },
  { category: "Marketing", amount: 234000, percentage: 7 },
  { category: "Operations", amount: 198000, percentage: 6 },
  { category: "Legal", amount: 123000, percentage: 4 },
  { category: "Others", amount: 89000, percentage: 2 }
];

const topTraders = [
  { name: "Rajesh Kumar", volume: "₹2.4M", trades: 234, success: 94 },
  { name: "Priya Sharma", volume: "₹1.8M", trades: 189, success: 91 },
  { name: "Amit Singh", volume: "₹1.5M", trades: 167, success: 89 },
  { name: "Neha Gupta", volume: "₹1.2M", trades: 145, success: 87 },
  { name: "Vikram Patel", volume: "₹980K", trades: 123, success: 85 }
];

export function StatisticsTab() {
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last30days");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("last30days"));
  const [selectedMetric, setSelectedMetric] = useState("revenue");

  const exportReport = (format: string) => {
    console.log(`Exporting report as ${format}`);
    // Implementation for export functionality
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `₹${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value}`;
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-8">
      {/* Header with Title and Date Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Statistics & Analytics</h1>
            <p className="text-muted-foreground">Comprehensive business insights and performance metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            preset={datePreset}
            onPresetChange={setDatePreset}
            className="min-w-[200px]"
          />
          <Button onClick={() => exportReport("pdf")} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button onClick={() => exportReport("csv")} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold text-foreground">{kpiData.revenue.value}</p>
                <div className="flex items-center mt-1">
                  <ArrowUp className="h-3 w-3 text-success mr-1" />
                  <span className="text-xs font-medium text-success">{kpiData.revenue.change}</span>
                </div>
              </div>
              <div className="p-2 bg-success/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Users</p>
                <p className="text-2xl font-bold text-foreground">{kpiData.users.value}</p>
                <div className="flex items-center mt-1">
                  <ArrowUp className="h-3 w-3 text-success mr-1" />
                  <span className="text-xs font-medium text-success">{kpiData.users.change}</span>
                </div>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Trades</p>
                <p className="text-2xl font-bold text-foreground">{kpiData.trades.value}</p>
                <div className="flex items-center mt-1">
                  <ArrowUp className="h-3 w-3 text-success mr-1" />
                  <span className="text-xs font-medium text-success">{kpiData.trades.change}</span>
                </div>
              </div>
              <div className="p-2 bg-info/10 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Employees</p>
                <p className="text-2xl font-bold text-foreground">{kpiData.employees.value}</p>
                <div className="flex items-center mt-1">
                  <ArrowUp className="h-3 w-3 text-success mr-1" />
                  <span className="text-xs font-medium text-success">{kpiData.employees.change}</span>
                </div>
              </div>
              <div className="p-2 bg-warning/10 rounded-lg">
                <Briefcase className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Profit</p>
                <p className="text-2xl font-bold text-foreground">{kpiData.profit.value}</p>
                <div className="flex items-center mt-1">
                  <ArrowUp className="h-3 w-3 text-success mr-1" />
                  <span className="text-xs font-medium text-success">{kpiData.profit.change}</span>
                </div>
              </div>
              <div className="p-2 bg-success/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Trading & Orders */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">Trading Volume</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={tradingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Area type="monotone" dataKey="completed" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Financial Insights */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-success" />
              <CardTitle className="text-lg font-semibold">Revenue & Profit</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={financialData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip 
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} name="Revenue" />
                <Line type="monotone" dataKey="netProfit" stroke="hsl(var(--success))" strokeWidth={2} name="Net Profit" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* KYC Status Breakdown */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-info" />
              <CardTitle className="text-lg font-semibold">KYC Status</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Approved", value: complianceData.kyc.approved, color: "hsl(var(--success))" },
                    { name: "Pending", value: complianceData.kyc.pending, color: "hsl(var(--warning))" },
                    { name: "Rejected", value: complianceData.kyc.rejected, color: "hsl(var(--destructive))" }
                  ]}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {[
                    { color: "hsl(var(--success))" },
                    { color: "hsl(var(--warning))" },
                    { color: "hsl(var(--destructive))" }
                  ].map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Employee Department Breakdown */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-warning" />
              <CardTitle className="text-lg font-semibold">Department Distribution</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={employeeData.departments}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tables Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Expense Breakdown */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5 text-destructive" />
              <CardTitle className="text-lg font-semibold">Expense Breakdown</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseBreakdown.map((expense) => (
                  <TableRow key={expense.category}>
                    <TableCell className="font-medium">{expense.category}</TableCell>
                    <TableCell>{formatCurrency(expense.amount)}</TableCell>
                    <TableCell>{expense.percentage}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top Traders */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-warning" />
              <CardTitle className="text-lg font-semibold">Top Traders</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Trades</TableHead>
                  <TableHead>Success</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topTraders.map((trader) => (
                  <TableRow key={trader.name}>
                    <TableCell className="font-medium">{trader.name}</TableCell>
                    <TableCell>{trader.volume}</TableCell>
                    <TableCell>{trader.trades}</TableCell>
                    <TableCell>{trader.success}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-info" />
              <CardTitle className="text-lg font-semibold">Compliance Overview</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm">Suspicious Transactions</span>
              <span className="font-bold text-destructive">{complianceData.suspicious}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Appeals Raised</span>
              <span className="font-bold">{complianceData.appeals.raised}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Appeals Resolved</span>
              <span className="font-bold text-success">{complianceData.appeals.resolved}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">User Analytics</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm">Daily Active Users</span>
              <span className="font-bold">3,789</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Monthly Active Users</span>
              <span className="font-bold">12,456</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">User Retention</span>
              <span className="font-bold text-success">80.2%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              <CardTitle className="text-lg font-semibold">Performance Metrics</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm">Avg. Order Completion</span>
              <span className="font-bold">13 mins</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Buy vs Sell Ratio</span>
              <span className="font-bold">1.1:1</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Cancelled Orders</span>
              <span className="font-bold">3.8%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

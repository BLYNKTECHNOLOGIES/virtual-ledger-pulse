
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from "recharts";
import { TrendingUp, Users, CheckCircle, XCircle, MessageSquare, Video, Calendar, DollarSign, ShoppingCart, UserCheck, Activity } from "lucide-react";

// Mock data for various statistics
const kycStatsData = [
  { name: "Jan", pending: 45, approved: 120, rejected: 15, queries: 8 },
  { name: "Feb", pending: 38, approved: 135, rejected: 12, queries: 6 },
  { name: "Mar", pending: 52, approved: 140, rejected: 18, queries: 10 },
  { name: "Apr", pending: 41, approved: 158, rejected: 14, queries: 7 },
  { name: "May", pending: 47, approved: 162, rejected: 16, queries: 9 },
  { name: "Jun", pending: 44, approved: 171, rejected: 13, queries: 8 },
];

const websiteTrafficData = [
  { name: "Jan", visitors: 12450, pageViews: 34200, bounceRate: 42 },
  { name: "Feb", visitors: 13200, pageViews: 36800, bounceRate: 38 },
  { name: "Mar", visitors: 14100, pageViews: 39500, bounceRate: 35 },
  { name: "Apr", visitors: 15600, pageViews: 42300, bounceRate: 33 },
  { name: "May", visitors: 16800, pageViews: 45700, bounceRate: 31 },
  { name: "Jun", visitors: 18200, pageViews: 48900, bounceRate: 29 },
];

const salesData = [
  { name: "Jan", orders: 245, revenue: 1245000, avgOrderValue: 5081 },
  { name: "Feb", orders: 289, revenue: 1456000, avgOrderValue: 5038 },
  { name: "Mar", orders: 312, revenue: 1587000, avgOrderValue: 5086 },
  { name: "Apr", orders: 356, revenue: 1823000, avgOrderValue: 5122 },
  { name: "May", orders: 398, revenue: 2045000, avgOrderValue: 5138 },
  { name: "Jun", orders: 434, revenue: 2234000, avgOrderValue: 5148 },
];

const userEngagementData = [
  { name: "New Users", value: 3245, color: "#10B981" },
  { name: "Returning Users", value: 5678, color: "#3B82F6" },
  { name: "Active Users", value: 2134, color: "#F59E0B" },
  { name: "Inactive Users", value: 876, color: "#EF4444" },
];

const operationalStats = [
  { metric: "Total Website Visitors", value: "89.2K", change: "+15.3%", icon: Users, period: "this month" },
  { metric: "Total Orders", value: "2,034", change: "+22.1%", icon: ShoppingCart, period: "this month" },
  { metric: "Revenue Generated", value: "₹12.3M", change: "+18.7%", icon: DollarSign, period: "this month" },
  { metric: "KYC Approval Rate", value: "87.5%", change: "+3.2%", icon: UserCheck, period: "this month" },
  { metric: "User Engagement", value: "68.4%", change: "+5.8%", icon: Activity, period: "this month" },
  { metric: "Video KYC Completion", value: "94.2%", change: "+5.1%", icon: Video, period: "this month" },
];

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'];

export function StatisticsTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold">Website & Operations Statistics</h2>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="website">Website Traffic</TabsTrigger>
          <TabsTrigger value="sales">Sales & Revenue</TabsTrigger>
          <TabsTrigger value="kyc-trends">KYC Trends</TabsTrigger>
          <TabsTrigger value="video-kyc">Video KYC</TabsTrigger>
          <TabsTrigger value="users">User Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {operationalStats.map((stat) => (
              <Card key={stat.metric}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {stat.metric}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-green-600 font-medium">
                      {stat.change} from last month
                    </div>
                    <div className="text-xs text-gray-500">
                      {stat.period}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${(Number(value) / 1000).toFixed(0)}K`} />
                    <Area type="monotone" dataKey="revenue" stroke="#10B981" fill="#10B981" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={userEngagementData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(Number(percent) * 100).toFixed(0)}%`}
                    >
                      {userEngagementData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="website">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Website Traffic Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={websiteTrafficData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="visitors" stroke="#3B82F6" strokeWidth={2} name="Visitors" />
                    <Line type="monotone" dataKey="pageViews" stroke="#10B981" strokeWidth={2} name="Page Views" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Website Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    <span>Total Visitors</span>
                  </div>
                  <span className="font-bold text-blue-600">89.2K</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-green-600" />
                    <span>Page Views</span>
                  </div>
                  <span className="font-bold text-green-600">245.6K</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-yellow-600" />
                    <span>Avg. Session Duration</span>
                  </div>
                  <span className="font-bold text-yellow-600">4m 32s</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Bounce Rate</span>
                    <span className="font-medium">29%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '71%' }}></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sales">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Sales Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="orders" fill="#3B82F6" name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Analytics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span>Total Revenue</span>
                  <span className="font-bold">₹12.39M</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span>Total Orders</span>
                  <span className="font-bold">2,034</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span>Average Order Value</span>
                  <span className="font-bold">₹5,148</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span>Conversion Rate</span>
                  <span className="font-bold">3.2%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="kyc-trends">
          <Card>
            <CardHeader>
              <CardTitle>KYC Processing Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={kycStatsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="approved" fill="#10B981" name="Approved" />
                  <Bar dataKey="pending" fill="#F59E0B" name="Pending" />
                  <Bar dataKey="rejected" fill="#EF4444" name="Rejected" />
                  <Bar dataKey="queries" fill="#8B5CF6" name="Queries" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="video-kyc">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Video KYC Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span>Completion Rate</span>
                  </div>
                  <span className="font-bold text-green-600">94.2%</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    <span>Average Duration</span>
                  </div>
                  <span className="font-bold text-blue-600">18 mins</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded">
                  <div className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-yellow-600" />
                    <span>Daily Average</span>
                  </div>
                  <span className="font-bold text-yellow-600">12 sessions</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-purple-50 rounded">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-600" />
                    <span>Total Completed</span>
                  </div>
                  <span className="font-bold text-purple-600">285</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Video KYC Quality Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>First Attempt Success</span>
                    <span className="font-medium">87%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '87%' }}></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Technical Issues</span>
                    <span className="font-medium">8%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full" style={{ width: '8%' }}></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>User Satisfaction</span>
                    <span className="font-medium">92%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '92%' }}></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>User Growth Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={websiteTrafficData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="visitors" stroke="#3B82F6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Engagement Analytics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span>Daily Active Users</span>
                  <span className="font-bold">2,134</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span>Monthly Active Users</span>
                  <span className="font-bold">8,923</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span>User Retention Rate</span>
                  <span className="font-bold">68.4%</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span>Churn Rate</span>
                  <span className="font-bold">12.3%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, XCircle, CalendarDays, PartyPopper, Search } from "lucide-react";
import { useLeaveRequests, useLeaveAllocations, useLeaveTypes } from "./useLeaveData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { format, isToday, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachWeekOfInterval, isWithinInterval } from "date-fns";

interface LeaveOverviewProps {
  onNavigate: (page: string) => void;
}

export function LeaveOverview({ onNavigate }: LeaveOverviewProps) {
  const { data: requests = [] } = useLeaveRequests();
  const { data: allocations = [] } = useLeaveAllocations();
  const { data: leaveTypes = [] } = useLeaveTypes();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const thisMonthRequests = requests.filter((r: any) => {
    const d = new Date(r.created_at);
    return d >= monthStart && d <= monthEnd;
  });

  const pendingCount = requests.filter((r: any) => r.status === "requested").length;
  const approvedThisMonth = thisMonthRequests.filter((r: any) => r.status === "approved").length;
  const rejectedThisMonth = thisMonthRequests.filter((r: any) => r.status === "rejected").length;

  // On Leave today
  const onLeaveToday = requests.filter((r: any) => {
    if (r.status !== "approved") return false;
    const start = new Date(r.start_date);
    const end = new Date(r.end_date);
    return now >= start && now <= end;
  });

  // Employee leaves chart - group by employee and leave type
  const employeeLeaveMap: Record<string, Record<string, number>> = {};
  requests.filter((r: any) => r.status === "approved").forEach((r: any) => {
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim();
    const type = r.hr_leave_types?.name || "Other";
    if (!employeeLeaveMap[name]) employeeLeaveMap[name] = {};
    employeeLeaveMap[name][type] = (employeeLeaveMap[name][type] || 0) + (r.total_days || 0);
  });
  const barData = Object.entries(employeeLeaveMap).slice(0, 6).map(([name, types]) => ({
    name: name.split(" ")[0],
    ...types,
  }));
  const allTypeNames = [...new Set(requests.filter((r: any) => r.status === "approved").map((r: any) => r.hr_leave_types?.name).filter(Boolean))];
  const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#8b5cf6", "#10b981", "#ec4899"];

  // Weekly leave analytics
  const weeks = eachWeekOfInterval({ start: startOfMonth(now), end: endOfMonth(now) });
  const weeklyData = weeks.map((weekStart, i) => {
    const wEnd = endOfWeek(weekStart);
    const count = requests.filter((r: any) => {
      const d = new Date(r.start_date);
      return isWithinInterval(d, { start: weekStart, end: wEnd });
    }).length;
    return { name: `Week ${i + 1}`, leaves: count };
  });

  // Department leaves pie (using leave types as proxy)
  const deptData = allTypeNames.map((name, i) => ({
    name,
    value: requests.filter((r: any) => r.hr_leave_types?.name === name && r.status === "approved").length,
    color: COLORS[i % COLORS.length],
  })).filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate("requests")}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Requests to Approve</p>
              <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Approved Leaves This Month</p>
              <p className="text-2xl font-bold text-green-600">{approvedThisMonth}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Rejected Leaves This Month</p>
              <p className="text-2xl font-bold text-red-600">{rejectedThisMonth}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Personal Dashboard button + Next Holiday */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2" />
        <Card className="bg-purple-600 text-white">
          <CardContent className="p-5 flex items-center gap-3">
            <PartyPopper className="h-10 w-10" />
            <div>
              <p className="font-bold">Next Holiday</p>
              <p className="text-sm opacity-90">None</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee Leaves Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Employee Leaves</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No approved leave data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis label={{ value: "Number of days", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  {allTypeNames.map((type, i) => (
                    <Bar key={type} dataKey={type} fill={COLORS[i % COLORS.length]} stackId="a" />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* On Leave Today */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">On Leave</CardTitle>
          </CardHeader>
          <CardContent>
            {onLeaveToday.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Search className="h-12 w-12 mb-3" />
                <p className="font-semibold text-gray-600">No Records found.</p>
                <p className="text-sm">No employees have taken leave today.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {onLeaveToday.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 p-2 border rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">
                      {r.hr_employees?.first_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</p>
                      <p className="text-xs text-gray-500">{r.hr_leave_types?.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Leave Analytics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Leave Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="leaves" stroke="#3b82f6" name="Leave Trends" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Leaves Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department Leaves</CardTitle>
          </CardHeader>
          <CardContent>
            {deptData.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={deptData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name }) => name}>
                    {deptData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

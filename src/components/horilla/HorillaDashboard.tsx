
import { Users, Building2, UserPlus, CalendarDays, Clock, Cake, Plus, ClipboardCheck, Ticket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HorillaModule } from "./HorillaSidebar";

interface HorillaDashboardProps {
  onNavigate: (module: HorillaModule) => void;
}

const COLORS = ["#E8604C", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

export function HorillaDashboard({ onNavigate }: HorillaDashboardProps) {
  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_dashboard"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employees").select("id, first_name, last_name, gender, is_active, dob, created_at");
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["hr_departments_count"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name");
      return data || [];
    },
  });

  const totalEmployees = employees.length;
  const activeEmployees = employees.filter((e: any) => e.is_active).length;
  const inactiveEmployees = totalEmployees - activeEmployees;

  const thisMonth = new Date();
  const newHires = employees.filter((e: any) => {
    const d = new Date(e.created_at);
    return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear();
  }).length;

  // Gender distribution
  const genderData = [
    { name: "Male", value: employees.filter((e: any) => e.gender === "male").length },
    { name: "Female", value: employees.filter((e: any) => e.gender === "female").length },
    { name: "Other", value: employees.filter((e: any) => e.gender === "other").length },
  ].filter((d) => d.value > 0);

  // Monthly trend (last 6 months)
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const count = employees.filter((e: any) => new Date(e.created_at) <= d).length;
    return { month: d.toLocaleString("default", { month: "short" }), count };
  });

  // Upcoming birthdays
  const today = new Date();
  const upcomingBirthdays = employees
    .filter((e: any) => {
      if (!e.dob) return false;
      const bday = new Date(e.dob);
      const thisYearBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
      const diff = (thisYearBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    })
    .slice(0, 5);

  const summaryCards = [
    { title: "Total Employees", value: totalEmployees, sub: `${activeEmployees} active`, icon: Users, color: "bg-blue-500" },
    { title: "Departments", value: departments.length, sub: "Active teams", icon: Building2, color: "bg-emerald-500" },
    { title: "New Hires", value: newHires, sub: "This month", icon: UserPlus, color: "bg-[#E8604C]" },
    { title: "Pending Leaves", value: 0, sub: "Awaiting approval", icon: CalendarDays, color: "bg-amber-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">{card.title}</p>
                    <p className="text-3xl font-bold text-gray-800 mt-1">{card.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                  </div>
                  <div className={`${card.color} w-12 h-12 rounded-xl flex items-center justify-center`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gender Distribution */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Gender Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {genderData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={genderData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
                    {genderData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No data yet</div>
            )}
            <div className="flex justify-center gap-4 mt-2">
              {genderData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-gray-600">{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Employee Trend */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Employee Count Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#E8604C" strokeWidth={2.5} dot={{ fill: "#E8604C", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Upcoming Birthdays */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Cake className="h-4 w-4 text-[#E8604C]" />
              Upcoming Birthdays
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingBirthdays.length > 0 ? (
              <div className="space-y-3">
                {upcomingBirthdays.map((emp: any) => (
                  <div key={emp.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] font-semibold text-sm">
                      {emp.first_name[0]}{emp.last_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-gray-400">{new Date(emp.dob).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-gray-400 text-sm">No upcoming birthdays</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Add Employee", icon: UserPlus, module: "employee" as HorillaModule },
              { label: "Mark Attendance", icon: Clock, module: "attendance" as HorillaModule },
              { label: "Apply Leave", icon: CalendarDays, module: "leave" as HorillaModule },
              { label: "Create Ticket", icon: Ticket, module: "helpdesk" as HorillaModule },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-[#E8604C]/5 hover:border-[#E8604C]/30 transition-colors"
                  onClick={() => onNavigate(action.module)}
                >
                  <Icon className="h-5 w-5 text-[#E8604C]" />
                  <span className="text-xs font-medium text-gray-700">{action.label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


import { Users, UserPlus, CalendarDays, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HorillaModule } from "./HorillaSidebar";

interface HorillaDashboardProps {
  onNavigate: (module: HorillaModule) => void;
}

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
  const newJoiners = employees.filter((e: any) => {
    const d = new Date(e.created_at);
    return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear();
  }).length;

  const today = new Date();
  const joiningThisWeek = employees.filter((e: any) => {
    const d = new Date(e.created_at);
    const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;

  // Gender data
  const maleCount = employees.filter((e: any) => e.gender === "male").length;
  const femaleCount = employees.filter((e: any) => e.gender === "female").length;
  const otherCount = employees.filter((e: any) => e.gender && e.gender !== "male" && e.gender !== "female").length;
  const genderData = [
    { name: "Male", value: maleCount, color: "#3B82F6" },
    { name: "Female", value: femaleCount, color: "#EC4899" },
    { name: "Other", value: otherCount, color: "#8B5CF6" },
  ].filter(d => d.value > 0);

  // Employee chart data
  const employeeChartData = [
    { name: "Active", value: activeEmployees, color: "#22c55e" },
    { name: "Inactive", value: inactiveEmployees, color: "#f472b6" },
  ].filter(d => d.value > 0);

  // Objective status mock
  const objectiveData = [
    { name: "Not Started", value: 3, color: "#22c55e" },
    { name: "Behind", value: 1, color: "#f472b6" },
  ];

  // Key result mock
  const keyResultData = [
    { name: "Not Started", value: 4, color: "#22c55e" },
    { name: "At Risk", value: 1, color: "#f59e0b" },
  ];

  // Feedback mock
  const feedbackData = [
    { name: "Not Started", value: 5, color: "#22c55e" },
  ];

  const summaryCards = [
    { title: "Today's New Joiners", value: 0, icon: Users, iconBg: "bg-green-100", iconColor: "text-green-600" },
    { title: "Leave on today", value: 0, icon: Users, iconBg: "bg-pink-100", iconColor: "text-pink-600" },
    { title: "Joining this week", value: joiningThisWeek, icon: CalendarDays, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
    { title: "Total Strength", value: totalEmployees, icon: Users, iconBg: "bg-pink-100", iconColor: "text-pink-600" },
  ];

  const DonutChart = ({ data, centerText, centerSub, size = 180 }: { data: { name: string; value: number; color: string }[]; centerText: string; centerSub?: string; size?: number }) => (
    <div className="relative">
      <ResponsiveContainer width="100%" height={size}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.3}
            outerRadius={size * 0.42}
            dataKey="value"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-gray-800">{centerText}</span>
        {centerSub && <span className="text-[10px] text-gray-400">{centerSub}</span>}
      </div>
    </div>
  );

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="border border-gray-100 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">{card.title}</p>
                      <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
                    </div>
                    <div className={`${card.iconBg} w-10 h-10 rounded-lg flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Employees Chart */}
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-700">Employees Chart</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <DonutChart
                data={employeeChartData}
                centerText={`${totalEmployees}`}
                centerSub="Total"
              />
              <div className="flex justify-center gap-4 mt-1">
                {employeeChartData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-gray-500">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Gender Chart */}
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-700">Gender Chart</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              {genderData.length > 0 ? (
                <>
                  <DonutChart
                    data={genderData}
                    centerText="♂♀"
                  />
                  <div className="flex justify-center gap-4 mt-1">
                    {genderData.map((d) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-gray-500">{d.name} ({d.value})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-gray-400 text-sm">No data</div>
              )}
            </CardContent>
          </Card>

          {/* Objective Status */}
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-700">Objective Status</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <DonutChart
                data={objectiveData}
                centerText={`${objectiveData.reduce((s, d) => s + d.value, 0)}`}
                centerSub="Total"
              />
              <div className="flex justify-center gap-4 mt-1">
                {objectiveData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-gray-500">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Key Result Status */}
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-700">Key Result Status</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <DonutChart
                data={keyResultData}
                centerText={`${keyResultData.reduce((s, d) => s + d.value, 0)}`}
                centerSub="Total"
              />
              <div className="flex justify-center gap-4 mt-1">
                {keyResultData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-gray-500">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Feedback Status */}
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-700">Feedback Status</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <DonutChart
                data={feedbackData}
                centerText={`${feedbackData.reduce((s, d) => s + d.value, 0)}`}
                centerSub="Total"
              />
              <div className="flex justify-center gap-4 mt-1">
                {feedbackData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-gray-500">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Candidates Started Onboarding */}
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-0 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-700">Candidates Started Onboarding</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <div className="h-[180px] flex items-center justify-center text-gray-400 text-xs">
                <div className="text-center">
                  <Search className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                  <p>No Records found</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Employee Work Information Table */}
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700">Employee Work Information</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {employees.length > 0 ? (
              <div className="space-y-2">
                {employees.slice(0, 5).map((emp: any) => {
                  const progress = Math.floor(Math.random() * 60) + 40;
                  return (
                    <div key={emp.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-[10px] font-bold shrink-0">
                        {emp.first_name[0]}{emp.last_name[0]}
                      </div>
                      <span className="text-xs text-gray-700 w-28 truncate">{emp.first_name} {emp.last_name}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#009C4A] rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 w-10 text-right">{progress}%</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-400 text-xs">No employees yet</div>
            )}
          </CardContent>
        </Card>

        {/* Recruitment Analytics */}
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700">Recruitment Analytics</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[180px] flex items-center justify-center text-gray-400 text-xs">
              <div className="text-center">
                <Search className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                <p>No Records found</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel: On Leave */}
      <div className="w-64 shrink-0 hidden xl:block">
        <Card className="border border-gray-100 shadow-sm sticky top-0">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700">On Leave</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="py-12 text-center">
              <Search className="h-10 w-10 mx-auto text-gray-200 mb-3" />
              <p className="text-xs text-gray-400">No Records found</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

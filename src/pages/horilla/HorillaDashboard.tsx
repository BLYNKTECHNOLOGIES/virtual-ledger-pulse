import {
  Users, UserPlus, CheckCircle, CalendarDays, DollarSign,
  Laptop, TrendingUp, AlertCircle
} from "lucide-react";

const statCards = [
  { label: "Total Employees", value: "129", sub: "+4 this month", subColor: "text-emerald-500", icon: Users, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
  { label: "Open Positions", value: "8", sub: "3 urgent", subColor: "text-amber-500", icon: UserPlus, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  { label: "Present Today", value: "112", sub: "86.8% attendance", subColor: "text-emerald-500", icon: CheckCircle, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  { label: "On Leave", value: "17", sub: "13.2% of workforce", subColor: "text-gray-500", icon: CalendarDays, iconBg: "bg-rose-100", iconColor: "text-rose-600" },
  { label: "Payroll This Month", value: "$284K", sub: "+2.1% vs last month", subColor: "text-emerald-500", icon: DollarSign, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  { label: "Assets Assigned", value: "87", sub: "3 pending", subColor: "text-gray-500", icon: Laptop, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  { label: "Avg Performance", value: "4.2", sub: "Above target", subColor: "text-emerald-500", icon: TrendingUp, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  { label: "Pending Requests", value: "12", sub: "5 urgent", subColor: "text-rose-500", icon: AlertCircle, iconBg: "bg-rose-100", iconColor: "text-rose-600" },
];

const departments = [
  { name: "Engineering", count: 45, pct: 35, color: "bg-[#6C63FF]" },
  { name: "Marketing", count: 22, pct: 17, color: "bg-[#6C63FF]" },
  { name: "Sales", count: 28, pct: 22, color: "bg-[#6C63FF]" },
  { name: "HR", count: 12, pct: 9, color: "bg-[#6C63FF]" },
  { name: "Finance", count: 18, pct: 14, color: "bg-[#6C63FF]" },
  { name: "Operations", count: 4, pct: 3, color: "bg-[#6C63FF]" },
];

const recentActivity = [
  { text: "John Doe requested leave", time: "2 min ago" },
  { text: "Jane Smith checked in", time: "15 min ago" },
  { text: "New candidate applied for Developer", time: "1 hr ago" },
  { text: "Payroll processed for January", time: "3 hrs ago" },
  { text: "Asset laptop assigned to Mike", time: "5 hrs ago" },
];

const upcomingLeaves = [
  { name: "Alice Johnson", dept: "Engineering", date: "Feb 18-20", type: "Vacation", typeColor: "bg-gray-100 text-gray-700" },
  { name: "Bob Williams", dept: "Marketing", date: "Feb 19", type: "Sick", typeColor: "bg-rose-100 text-rose-700" },
  { name: "Carol Davis", dept: "HR", date: "Feb 21-22", type: "Personal", typeColor: "bg-gray-100 text-gray-700" },
];

export default function HorillaDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back! Here's what's happening today.</p>
      </div>

      {/* 8 stat cards — 4 per row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
              <p className={`text-xs mt-1 ${c.subColor}`}>{c.sub}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
              <c.icon className={`h-5 w-5 ${c.iconColor}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row: 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Department Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Department Distribution</h3>
          <div className="space-y-3">
            {departments.map((d) => (
              <div key={d.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700">{d.name}</span>
                  <span className="text-gray-500">{d.count} ({d.pct}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-[#6C63FF] mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-800">{a.text}</p>
                  <p className="text-xs text-gray-400">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Leaves */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Upcoming Leaves</h3>
          <div className="space-y-3">
            {upcomingLeaves.map((l, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">{l.name}</p>
                  <p className="text-xs text-gray-400">{l.dept} · {l.date}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${l.typeColor}`}>
                  {l.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

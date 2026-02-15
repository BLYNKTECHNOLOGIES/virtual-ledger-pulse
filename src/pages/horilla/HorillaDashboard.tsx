import { 
  Users, UserPlus, Clock, CalendarDays, TrendingUp, TrendingDown,
  AlertCircle, CheckCircle, ArrowUpRight
} from "lucide-react";

const statCards = [
  { label: "Total Employees", value: "0", change: "+0%", icon: Users, color: "#3b82f6", bgColor: "#eff6ff" },
  { label: "New Hires", value: "0", change: "+0%", icon: UserPlus, color: "#10b981", bgColor: "#ecfdf5" },
  { label: "On Leave", value: "0", change: "0%", icon: CalendarDays, color: "#f59e0b", bgColor: "#fffbeb" },
  { label: "Late Today", value: "0", change: "0%", icon: Clock, color: "#ef4444", bgColor: "#fef2f2" },
];

export default function HorillaDashboard() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back! Here's your HR overview.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">{card.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-green-600 font-medium">{card.change}</span>
                  <span className="text-xs text-gray-400 ml-1">vs last month</span>
                </div>
              </div>
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: card.bgColor }}
              >
                <card.icon className="h-5 w-5" style={{ color: card.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: "Add New Employee", icon: UserPlus, path: "/hrms/employee" },
              { label: "Mark Attendance", icon: Clock, path: "/hrms/attendance" },
              { label: "Create Recruitment", icon: Users, path: "/hrms/recruitment" },
              { label: "Process Payroll", icon: CalendarDays, path: "/hrms/payroll" },
            ].map((action) => (
              <button
                key={action.label}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#E8604C]/10 flex items-center justify-center group-hover:bg-[#E8604C]/20 transition-colors">
                  <action.icon className="h-4 w-4 text-[#E8604C]" />
                </div>
                <span className="font-medium">{action.label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-gray-400 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Pending Approvals</h3>
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <CheckCircle className="h-10 w-10 mb-2 text-gray-300" />
            <p className="text-sm">No pending approvals</p>
          </div>
        </div>

        {/* Announcements */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Announcements</h3>
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <AlertCircle className="h-10 w-10 mb-2 text-gray-300" />
            <p className="text-sm">No announcements</p>
          </div>
        </div>
      </div>

      {/* Department Overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Department Overview</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Department</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Employees</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Active</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">On Leave</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Open Positions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  Connect employee data to see department overview
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

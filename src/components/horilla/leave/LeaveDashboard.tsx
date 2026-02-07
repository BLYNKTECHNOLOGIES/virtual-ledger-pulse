
import { useState } from "react";
import { LayoutDashboard, FileText, ClipboardList, Tag, CalendarCheck, GitPullRequest } from "lucide-react";
import { LeaveOverview } from "./LeaveOverview";
import { MyLeaveRequests } from "./MyLeaveRequests";
import { LeaveRequestsPage } from "./LeaveRequestsPage";
import { LeaveTypesPage } from "./LeaveTypesPage";
import { AssignedLeavesPage } from "./AssignedLeavesPage";
import { LeaveAllocationRequestsPage } from "./LeaveAllocationRequestsPage";

type LeavePage = "dashboard" | "my-requests" | "requests" | "types" | "assigned" | "allocation-requests";

const navItems: { id: LeavePage; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "my-requests", label: "My Leave Requests", icon: FileText },
  { id: "requests", label: "Leave Requests", icon: ClipboardList },
  { id: "types", label: "Leave Types", icon: Tag },
  { id: "assigned", label: "Assigned Leave", icon: CalendarCheck },
  { id: "allocation-requests", label: "Leave Allocation Request", icon: GitPullRequest },
];

export function LeaveDashboard() {
  const [activePage, setActivePage] = useState<LeavePage>("dashboard");

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <LeaveOverview onNavigate={(p) => setActivePage(p as LeavePage)} />;
      case "my-requests":
        return <MyLeaveRequests onCreateRequest={() => setActivePage("requests")} />;
      case "requests":
        return <LeaveRequestsPage />;
      case "types":
        return <LeaveTypesPage />;
      case "assigned":
        return <AssignedLeavesPage />;
      case "allocation-requests":
        return <LeaveAllocationRequestsPage />;
      default:
        return <LeaveOverview onNavigate={(p) => setActivePage(p as LeavePage)} />;
    }
  };

  return (
    <div className="flex gap-6">
      {/* Left Sidebar Navigation */}
      <div className="w-56 shrink-0">
        <div className="sticky top-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Leave</h3>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                    isActive
                      ? "bg-[#009C4A]/10 text-[#009C4A] font-semibold"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {renderPage()}
      </div>
    </div>
  );
}

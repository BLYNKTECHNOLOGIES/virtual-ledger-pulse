import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, Users, UserPlus, Rocket, Clock, 
  CalendarDays, Wallet, Laptop, BarChart3, LogOut,
  HelpCircle, ChevronRight, ChevronLeft
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
  children?: { label: string; path: string }[];
}

const sidebarItems: SidebarItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    path: "/hrms",
  },
  {
    id: "employee",
    label: "Employee",
    icon: Users,
    path: "/hrms/employee",
    children: [
      { label: "Employee List", path: "/hrms/employee" },
      { label: "Departments", path: "/hrms/employee/departments" },
      { label: "Positions", path: "/hrms/employee/positions" },
    ],
  },
  {
    id: "recruitment",
    label: "Recruitment",
    icon: UserPlus,
    path: "/hrms/recruitment",
    children: [
      { label: "Dashboard", path: "/hrms/recruitment" },
      { label: "Pipeline", path: "/hrms/recruitment/pipeline" },
      { label: "Candidates", path: "/hrms/recruitment/candidates" },
      { label: "Job Positions", path: "/hrms/recruitment/positions" },
    ],
  },
  {
    id: "onboarding",
    label: "Onboarding",
    icon: Rocket,
    path: "/hrms/onboarding",
    children: [
      { label: "Onboarding View", path: "/hrms/onboarding" },
      { label: "Stages", path: "/hrms/onboarding/stages" },
    ],
  },
  {
    id: "attendance",
    label: "Attendance",
    icon: Clock,
    path: "/hrms/attendance",
    children: [
      { label: "Overview", path: "/hrms/attendance" },
      { label: "Shifts", path: "/hrms/attendance/shifts" },
      { label: "Overtime", path: "/hrms/attendance/overtime" },
    ],
  },
  {
    id: "leave",
    label: "Leave",
    icon: CalendarDays,
    path: "/hrms/leave",
    children: [
      { label: "Dashboard", path: "/hrms/leave" },
      { label: "Requests", path: "/hrms/leave/requests" },
      { label: "Leave Types", path: "/hrms/leave/types" },
      { label: "Holidays", path: "/hrms/leave/holidays" },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    icon: Wallet,
    path: "/hrms/payroll",
    children: [
      { label: "Dashboard", path: "/hrms/payroll" },
      { label: "Payslips", path: "/hrms/payroll/payslips" },
      { label: "Allowances", path: "/hrms/payroll/allowances" },
      { label: "Deductions", path: "/hrms/payroll/deductions" },
    ],
  },
  {
    id: "asset",
    label: "Asset",
    icon: Laptop,
    path: "/hrms/asset",
    children: [
      { label: "Dashboard", path: "/hrms/asset" },
      { label: "Assignments", path: "/hrms/asset/assignments" },
    ],
  },
  {
    id: "pms",
    label: "Performance",
    icon: BarChart3,
    path: "/hrms/pms",
    children: [
      { label: "Dashboard", path: "/hrms/pms" },
      { label: "Objectives", path: "/hrms/pms/objectives" },
      { label: "Feedback", path: "/hrms/pms/feedback" },
    ],
  },
  {
    id: "offboarding",
    label: "Offboarding",
    icon: LogOut,
    path: "/hrms/offboarding",
  },
  {
    id: "helpdesk",
    label: "Helpdesk",
    icon: HelpCircle,
    path: "/hrms/helpdesk",
    children: [
      { label: "Tickets", path: "/hrms/helpdesk" },
      { label: "FAQ", path: "/hrms/helpdesk/faq" },
    ],
  },
];

interface HorillaSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function HorillaSidebar({ collapsed, onToggle }: HorillaSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedItems, setExpandedItems] = useState<string[]>(["employee"]);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const isActive = (path: string) => {
    if (path === "/hrms") return location.pathname === "/hrms";
    return location.pathname.startsWith(path);
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <aside 
      className={cn(
        "h-screen flex flex-col bg-[#1e1e2d] text-gray-300 transition-all duration-300 shrink-0",
        collapsed ? "w-[68px]" : "w-[250px]"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-[#2d2d3f] shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#E8604C] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">H</span>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">Horilla</span>
          </div>
        ) : (
          <div className="w-8 h-8 bg-[#E8604C] rounded-lg flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-sm">H</span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-thin scrollbar-thumb-[#2d2d3f]">
        {sidebarItems.map((item) => {
          const active = isActive(item.path);
          const expanded = expandedItems.includes(item.id);
          const hasChildren = item.children && item.children.length > 0;

          return (
            <div key={item.id} className="relative"
              onMouseEnter={() => collapsed && setHoveredItem(item.id)}
              onMouseLeave={() => collapsed && setHoveredItem(null)}
            >
              {/* Main item */}
              <button
                onClick={() => {
                  if (hasChildren && !collapsed) {
                    toggleExpand(item.id);
                  } else {
                    navigate(item.path);
                  }
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  active 
                    ? "bg-[#E8604C] text-white shadow-lg shadow-[#E8604C]/20" 
                    : "text-gray-400 hover:text-white hover:bg-[#2d2d3f]",
                  collapsed && "justify-center px-2"
                )}
              >
                <item.icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-white")} />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {hasChildren && (
                      <ChevronRight className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        expanded && "rotate-90"
                      )} />
                    )}
                  </>
                )}
              </button>

              {/* Expanded children (non-collapsed) */}
              {!collapsed && hasChildren && expanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[#2d2d3f] pl-4">
                  {item.children!.map((child) => {
                    const childActive = location.pathname === child.path;
                    return (
                      <button
                        key={child.path}
                        onClick={() => navigate(child.path)}
                        className={cn(
                          "w-full text-left text-sm py-2 px-2 rounded-md transition-colors",
                          childActive 
                            ? "text-[#E8604C] bg-[#E8604C]/10 font-medium" 
                            : "text-gray-500 hover:text-gray-300 hover:bg-[#2d2d3f]/50"
                        )}
                      >
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Flyout (collapsed mode) */}
              {collapsed && hoveredItem === item.id && hasChildren && (
                <div className="absolute left-full top-0 ml-2 bg-[#1e1e2d] border border-[#2d2d3f] rounded-lg shadow-xl py-2 min-w-[180px] z-50">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {item.label}
                  </div>
                  {item.children!.map((child) => {
                    const childActive = location.pathname === child.path;
                    return (
                      <button
                        key={child.path}
                        onClick={() => navigate(child.path)}
                        className={cn(
                          "w-full text-left text-sm py-2 px-3 transition-colors",
                          childActive 
                            ? "text-[#E8604C] bg-[#E8604C]/10" 
                            : "text-gray-400 hover:text-white hover:bg-[#2d2d3f]"
                        )}
                      >
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-[#2d2d3f] shrink-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-gray-500 hover:text-white hover:bg-[#2d2d3f] transition-colors text-sm"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

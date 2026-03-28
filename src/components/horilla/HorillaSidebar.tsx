import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  Wallet,
  Laptop,
  BarChart3,
  LogOut,
  HelpCircle,
  ChevronDown,
  Building2,
  FileText,
  Megaphone,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  children?: { label: string; path: string }[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "MAIN",
    items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/hrms" }],
  },
  {
    title: "WORKFORCE",
    items: [
      {
        label: "Employees",
        icon: Users,
        path: "/hrms/employee",
        children: [
          { label: "Employee List", path: "/hrms/employee" },
          { label: "Departments", path: "/hrms/employee/departments" },
          { label: "Positions", path: "/hrms/employee/positions" },
        ],
      },
    ],
  },
  {
    title: "TIME & ATTENDANCE",
    items: [
      {
        label: "Attendance",
        icon: Clock,
        path: "/hrms/attendance",
        children: [
          { label: "Overview", path: "/hrms/attendance" },
          { label: "Biometric Devices", path: "/hrms/attendance/biometric-devices" },
          { label: "Clock In/Out", path: "/hrms/attendance/activity" },
          { label: "Calendar View", path: "/hrms/attendance/calendar" },
          { label: "Summary Report", path: "/hrms/attendance/summary" },
          { label: "Shifts", path: "/hrms/attendance/shifts" },
          { label: "Overtime", path: "/hrms/attendance/overtime" },
          { label: "Hour Accounts", path: "/hrms/attendance/hour-accounts" },
          { label: "Late Come / Early Out", path: "/hrms/attendance/late-early" },
        ],
      },
      {
        label: "Leave",
        icon: CalendarDays,
        path: "/hrms/leave",
        children: [
          { label: "Dashboard", path: "/hrms/leave" },
          { label: "Requests", path: "/hrms/leave/requests" },
          { label: "Allocations", path: "/hrms/leave/allocations" },
          { label: "Leave Types", path: "/hrms/leave/types" },
          { label: "Holidays", path: "/hrms/leave/holidays" },
          { label: "Comp-Off", path: "/hrms/leave/comp-off" },
          { label: "Accrual Plans", path: "/hrms/leave/accrual-plans" },
        ],
      },
    ],
  },
  {
    title: "FINANCE",
    items: [
      {
        label: "Payroll",
        icon: Wallet,
        path: "/hrms/payroll",
        children: [
          { label: "Dashboard", path: "/hrms/payroll" },
          { label: "Payslips", path: "/hrms/payroll/payslips" },
          { label: "Salary Structure", path: "/hrms/payroll/salary-structure" },
          { label: "Allowances", path: "/hrms/payroll/allowances" },
          { label: "Deductions", path: "/hrms/payroll/deductions" },
          { label: "Penalties", path: "/hrms/payroll/penalties" },
          { label: "Loans & Advances", path: "/hrms/payroll/loans" },
          { label: "Tax Config", path: "/hrms/payroll/tax-config" },
          { label: "Deposits", path: "/hrms/payroll/deposits" },
        ],
      },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      {
        label: "Assets",
        icon: Laptop,
        path: "/hrms/asset",
        children: [
          { label: "Dashboard", path: "/hrms/asset" },
          { label: "All Assets", path: "/hrms/asset/list" },
          { label: "Assignments", path: "/hrms/asset/assignments" },
        ],
      },
      {
        label: "Performance",
        icon: BarChart3,
        path: "/hrms/pms",
        children: [
          { label: "Dashboard", path: "/hrms/pms" },
          { label: "Objectives", path: "/hrms/pms/objectives" },
          { label: "360° Feedback", path: "/hrms/pms/feedback" },
        ],
      },
      {
        label: "Helpdesk",
        icon: HelpCircle,
        path: "/hrms/helpdesk",
        children: [
          { label: "Tickets", path: "/hrms/helpdesk" },
          { label: "FAQ", path: "/hrms/helpdesk/faq" },
        ],
      },
      { label: "Organization", icon: Building2, path: "/hrms/organization" },
      { label: "Documents", icon: FileText, path: "/hrms/documents" },
      { label: "Announcements", icon: Megaphone, path: "/hrms/announcements" },
    ],
  },
  {
    title: "ANALYTICS",
    items: [{ label: "Reports", icon: BarChart3, path: "/hrms/reports" }],
  },
  {
    title: "SYSTEM",
    items: [{ label: "Offboarding", icon: LogOut, path: "/hrms/offboarding" }],
  },
];

interface HorillaSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function HorillaSidebar({
  collapsed,
  onToggle,
  isMobile = false,
  mobileOpen = false,
  onCloseMobile,
}: HorillaSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const isActive = (path: string) => {
    if (path === "/hrms") return location.pathname === "/hrms";
    return location.pathname.startsWith(path);
  };

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  };

  const handleNavigate = (path: string) => {
    if (path.startsWith("http")) {
      window.open(path, "_blank");
    } else {
      navigate(path);
    }

    if (isMobile) {
      onCloseMobile?.();
    }
  };

  return (
    <aside
      className={cn(
        "h-screen flex flex-col bg-[#1a1a2e] text-gray-300 transition-all duration-300 shrink-0",
        isMobile
          ? cn(
              "fixed inset-y-0 left-0 z-50 w-[240px]",
              mobileOpen ? "translate-x-0" : "-translate-x-full"
            )
          : collapsed
          ? "w-[68px]"
          : "w-[240px]"
      )}
    >
      <div className="h-14 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#6C63FF] rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-white font-semibold text-xs tracking-tight">BLYNK VIRTUAL</span>
              <span className="text-white font-semibold text-xs tracking-tight">TECHNOLOGIES</span>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-4 scrollbar-thin scrollbar-thumb-[#2a2a40]">
        {navGroups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.12em] px-2 mb-1.5">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.path);
                const expanded = expandedItems.includes(item.label);
                const hasChildren = item.children && item.children.length > 0;

                return (
                  <div
                    key={item.label}
                    className="relative"
                    onMouseEnter={() => !isMobile && collapsed && setHoveredItem(item.label)}
                    onMouseLeave={() => !isMobile && collapsed && setHoveredItem(null)}
                  >
                    <button
                      onClick={() => {
                        if (hasChildren && !collapsed) {
                          toggleExpand(item.label);
                        } else {
                          handleNavigate(item.path);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
                        active
                          ? "bg-[#6C63FF] text-white"
                          : "text-gray-400 hover:text-gray-200 hover:bg-[#252540]",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <item.icon className="h-[17px] w-[17px] shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-left">{item.label}</span>
                          {hasChildren && (
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                expanded && "rotate-180"
                              )}
                            />
                          )}
                        </>
                      )}
                    </button>

                    {!collapsed && hasChildren && expanded && (
                      <div className="mt-0.5 ml-6 space-y-0.5 border-l border-[#2a2a40] pl-3">
                        {item.children!.map((child) => {
                          const childActive = location.pathname === child.path;
                          return (
                            <button
                              key={child.path}
                              onClick={() => handleNavigate(child.path)}
                              className={cn(
                                "w-full text-left text-[13px] py-1.5 px-2 rounded-md transition-colors",
                                childActive ? "text-[#6C63FF] font-medium" : "text-gray-500 hover:text-gray-300"
                              )}
                            >
                              {child.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {!isMobile && collapsed && hoveredItem === item.label && hasChildren && (
                      <div className="absolute left-full top-0 ml-2 bg-[#1a1a2e] border border-[#2a2a40] rounded-lg shadow-2xl py-2 min-w-[180px] z-50">
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                          {item.label}
                        </div>
                        {item.children!.map((child) => (
                          <button
                            key={child.path}
                            onClick={() => handleNavigate(child.path)}
                            className={cn(
                              "w-full text-left text-sm py-2 px-3 transition-colors",
                              location.pathname === child.path
                                ? "text-[#6C63FF] bg-[#6C63FF]/10"
                                : "text-gray-400 hover:text-white hover:bg-[#252540]"
                            )}
                          >
                            {child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!isMobile && (
        <div className="px-3 py-3 border-t border-[#2a2a40] shrink-0">
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-[#252540] transition-colors text-[13px]"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}

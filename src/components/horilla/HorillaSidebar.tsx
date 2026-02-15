import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, Users, UserPlus, Rocket, Clock, 
  CalendarDays, Wallet, Laptop, BarChart3, LogOut,
  HelpCircle, ChevronDown, Building2, FileText, Megaphone,
  ChevronLeft, ChevronRight
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
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/hrms" },
    ],
  },
  {
    title: "WORKFORCE",
    items: [
      {
        label: "Employees", icon: Users, path: "/hrms/employee",
        children: [
          { label: "Employee List", path: "/hrms/employee" },
          { label: "Departments", path: "/hrms/employee/departments" },
          { label: "Positions", path: "/hrms/employee/positions" },
        ],
      },
      {
        label: "Recruitment", icon: UserPlus, path: "/hrms/recruitment",
        children: [
          { label: "Dashboard", path: "/hrms/recruitment" },
          { label: "Recruitment Pipeline", path: "/hrms/recruitment/pipeline" },
          { label: "Recruitment Survey", path: "/hrms/recruitment/survey" },
          { label: "Candidates", path: "/hrms/recruitment/candidates" },
          { label: "Interview", path: "/hrms/recruitment/interview" },
          { label: "Open Jobs", path: "/hrms/recruitment/positions" },
          { label: "Stages", path: "/hrms/recruitment/stages" },
          { label: "Skill Zone", path: "/hrms/recruitment/skill-zone" },
        ],
      },
      {
        label: "Onboarding", icon: Rocket, path: "/hrms/onboarding",
        children: [
          { label: "Overview", path: "/hrms/onboarding" },
          { label: "Stages", path: "/hrms/onboarding/stages" },
        ],
      },
    ],
  },
  {
    title: "TIME & ATTENDANCE",
    items: [
      {
        label: "Attendance", icon: Clock, path: "/hrms/attendance",
        children: [
          { label: "Overview", path: "/hrms/attendance" },
          { label: "Calendar View", path: "/hrms/attendance/calendar" },
          { label: "Shifts", path: "/hrms/attendance/shifts" },
          { label: "Overtime", path: "/hrms/attendance/overtime" },
        ],
      },
      {
        label: "Leave", icon: CalendarDays, path: "/hrms/leave",
        children: [
          { label: "Dashboard", path: "/hrms/leave" },
          { label: "Requests", path: "/hrms/leave/requests" },
          { label: "Allocations", path: "/hrms/leave/allocations" },
          { label: "Leave Types", path: "/hrms/leave/types" },
          { label: "Holidays", path: "/hrms/leave/holidays" },
        ],
      },
    ],
  },
  {
    title: "FINANCE",
    items: [
      {
        label: "Payroll", icon: Wallet, path: "/hrms/payroll",
        children: [
          { label: "Dashboard", path: "/hrms/payroll" },
          { label: "Payslips", path: "/hrms/payroll/payslips" },
          { label: "Allowances", path: "/hrms/payroll/allowances" },
          { label: "Deductions", path: "/hrms/payroll/deductions" },
        ],
      },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      { label: "Assets", icon: Laptop, path: "/hrms/asset" },
      {
        label: "Performance", icon: BarChart3, path: "/hrms/pms",
        children: [
          { label: "Dashboard", path: "/hrms/pms" },
          { label: "Objectives", path: "/hrms/pms/objectives" },
          { label: "360° Feedback", path: "/hrms/pms/feedback" },
        ],
      },
      {
        label: "Helpdesk", icon: HelpCircle, path: "/hrms/helpdesk",
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
    items: [
      { label: "Reports", icon: BarChart3, path: "/hrms/reports" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { label: "Offboarding", icon: LogOut, path: "/hrms/offboarding" },
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
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const isActive = (path: string) => {
    if (path === "/hrms") return location.pathname === "/hrms";
    return location.pathname.startsWith(path);
  };

  const toggleExpand = (label: string) => {
    setExpandedItems(prev =>
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    );
  };

  return (
    <aside
      className={cn(
        "h-screen flex flex-col bg-[#1a1a2e] text-gray-300 transition-all duration-300 shrink-0",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#6C63FF] rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">H</span>
          </div>
          {!collapsed && (
            <span className="text-white font-semibold text-lg tracking-tight">Horilla</span>
          )}
        </div>
      </div>

      {/* Navigation */}
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
                    onMouseEnter={() => collapsed && setHoveredItem(item.label)}
                    onMouseLeave={() => collapsed && setHoveredItem(null)}
                  >
                    <button
                      onClick={() => {
                        if (hasChildren && !collapsed) {
                          toggleExpand(item.label);
                        } else {
                          navigate(item.path);
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

                    {/* Children expanded */}
                    {!collapsed && hasChildren && expanded && (
                      <div className="mt-0.5 ml-6 space-y-0.5 border-l border-[#2a2a40] pl-3">
                        {item.children!.map((child) => {
                          const childActive = location.pathname === child.path;
                          return (
                            <button
                              key={child.path}
                              onClick={() => navigate(child.path)}
                              className={cn(
                                "w-full text-left text-[13px] py-1.5 px-2 rounded-md transition-colors",
                                childActive
                                  ? "text-[#6C63FF] font-medium"
                                  : "text-gray-500 hover:text-gray-300"
                              )}
                            >
                              {child.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Flyout on collapsed */}
                    {collapsed && hoveredItem === item.label && hasChildren && (
                      <div className="absolute left-full top-0 ml-2 bg-[#1a1a2e] border border-[#2a2a40] rounded-lg shadow-2xl py-2 min-w-[180px] z-50">
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                          {item.label}
                        </div>
                        {item.children!.map((child) => (
                          <button
                            key={child.path}
                            onClick={() => navigate(child.path)}
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

    {/* Collapse Toggle */}
    <div className="px-3 py-3 border-t border-[#2a2a40] shrink-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-[#252540] transition-colors text-[13px]"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
      </button>
    </div>
  </aside>
  );
}

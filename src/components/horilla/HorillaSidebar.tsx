import { useState, useEffect, useMemo, useCallback } from "react";
import blynkIcon from "@/assets/brand/blynk-icon.svg";
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
  Briefcase,
  AlertTriangle,
  Mail,

  
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { prefetchHrmsRoute } from "@/lib/hrmsPrefetch";
import { usePermissions } from "@/hooks/usePermissions";
import { expandPermissions } from "@/lib/permissions/catalog";

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
          { label: "Onboarding", path: "/hrms/onboarding-pipeline" },
          { label: "Departments", path: "/hrms/employee/departments" },
          { label: "Positions", path: "/hrms/employee/positions" },
          { label: "Documents", path: "/hrms/employee/documents" },
          { label: "Separation", path: "/hrms/employee/separation" },
          { label: "F&F Settlement", path: "/hrms/offboarding/fnf" },
        ],
      },
    ],
  },
  {
    title: "RECRUITMENT",
    items: [
      {
        label: "Recruitment",
        icon: Briefcase,
        path: "/hrms/recruitment",
        children: [
          { label: "Dashboard", path: "/hrms/recruitment" },
          { label: "Pipeline", path: "/hrms/recruitment/pipeline" },
          { label: "Candidates", path: "/hrms/recruitment/candidates" },
          { label: "Rejected Candidates", path: "/hrms/recruitment/rejected" },
          { label: "Interviews", path: "/hrms/recruitment/interviews" },
          { label: "Stages", path: "/hrms/recruitment/stages" },
          { label: "Skill Zones", path: "/hrms/recruitment/skill-zones" },
          { label: "Surveys", path: "/hrms/recruitment/surveys" },
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
          
          { label: "Calendar View", path: "/hrms/attendance/calendar" },
          { label: "Summary Report", path: "/hrms/attendance/summary" },
          { label: "Shifts", path: "/hrms/attendance/shifts" },
          { label: "Hours & Overtime", path: "/hrms/attendance/hours" },
          { label: "Late Come / Early Out", path: "/hrms/attendance/late-early" },
          { label: "Raw Punches", path: "/hrms/attendance/punches" },

          { label: "Regularization Requests", path: "/hrms/attendance/regularization" },
          { label: "Stale Sessions", path: "/hrms/attendance/stale-sessions" },
          { label: "Period Locks", path: "/hrms/attendance/period-locks" },
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
          { label: "Allocation Requests", path: "/hrms/leave/allocation-requests" },
          { label: "Accrual Plans", path: "/hrms/leave/accrual-plans" },
          { label: "Weekly Off", path: "/hrms/leave/weekly-off" },
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
          // Month-end tooling (inputs, LOP, imports, shadow run, drift, pulse) lives INSIDE the cockpit.
          { label: "Monthly Cockpit", path: "/hrms/payroll/cockpit" },
          { label: "Dashboard", path: "/hrms/payroll" },
          { label: "Payslips", path: "/hrms/payroll/payslips" },
          { label: "Salary Revisions", path: "/hrms/payroll/salary-revisions" },
          { label: "Statutory Settings", path: "/hrms/payroll/statutory-settings" },
          { label: "Salary Components", path: "/hrms/payroll/salary-components" },
          { label: "Penalties", path: "/hrms/payroll/penalties" },
          { label: "Loans & Advances", path: "/hrms/payroll/loans" },
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
          
          { label: "360° Feedback", path: "/hrms/pms/feedback" },
          { label: "MPI", path: "/hrms/pms/mpi" },
        ],
      },
      {
        label: "Helpdesk",
        icon: HelpCircle,
        path: "/hrms/helpdesk",
        children: [
          { label: "Tickets", path: "/hrms/helpdesk" },
          
          { label: "HR Policies", path: "/hrms/helpdesk/policies" },
        ],
      },
      { label: "Organization", icon: Building2, path: "/hrms/organization" },
      { label: "Documents", icon: FileText, path: "/hrms/documents" },
      { label: "Announcements", icon: Megaphone, path: "/hrms/announcements" },
      { label: "Mailbox", icon: Mail, path: "/hrms/mailbox" },
      { label: "Disciplinary Actions", icon: AlertTriangle, path: "/hrms/disciplinary-actions" },
      
    ],
  },
  {
    title: "ANALYTICS",
    items: [
      { label: "Reports", icon: BarChart3, path: "/hrms/reports" },
      { label: "Registers", icon: FileSpreadsheet, path: "/hrms/registers" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      {
        label: "HR Logs",
        icon: FileText,
        path: "/hrms/logs",
      },
    ],
  },
];

const HRMS_ROUTE_PERMISSIONS: Record<string, string[]> = {
  "/hrms": ["hrms_view", "hrms_manage"],
  "/hrms/employee": ["hrms_employees_view", "hrms_employees_manage"],
  "/hrms/employee/departments": ["hrms_employees_view", "hrms_employees_manage"],
  "/hrms/employee/positions": ["hrms_employees_view", "hrms_employees_manage"],
  "/hrms/employee/documents": ["hrms_documents_view", "hrms_documents_manage"],
  "/hrms/employee/separation": ["hrms_employees_view", "hrms_employees_manage"],
  "/hrms/offboarding/fnf": ["hrms_employees_view", "hrms_employees_manage", "hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/onboarding-pipeline": ["hrms_employees_view", "hrms_employees_manage", "hrms_recruitment_view", "hrms_recruitment_manage"],
  "/hrms/recruitment": ["hrms_recruitment_view", "hrms_recruitment_manage"],
  "/hrms/recruitment/pipeline": ["hrms_recruitment_view", "hrms_recruitment_manage"],
  "/hrms/recruitment/candidates": ["hrms_recruitment_view", "hrms_recruitment_manage"],
  "/hrms/recruitment/rejected": ["hrms_recruitment_view", "hrms_recruitment_manage"],
  "/hrms/recruitment/interviews": ["hrms_recruitment_view", "hrms_recruitment_manage"],
  "/hrms/recruitment/stages": ["hrms_recruitment_view", "hrms_recruitment_manage"],
  "/hrms/recruitment/skill-zones": ["hrms_recruitment_view", "hrms_recruitment_manage"],
  "/hrms/recruitment/surveys": ["hrms_recruitment_view", "hrms_recruitment_manage"],
  "/hrms/attendance": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/attendance/biometric-devices": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/attendance/calendar": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/attendance/summary": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/attendance/shifts": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/attendance/hours": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/attendance/late-early": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/attendance/punches": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/attendance/regularization": ["hrms_attendance_view", "hrms_attendance_manage", "hrms_attendance_approve"],
  "/hrms/attendance/stale-sessions": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/attendance/period-locks": ["hrms_attendance_view", "hrms_attendance_manage"],
  "/hrms/leave": ["hrms_leave_view", "hrms_leave_manage"],
  "/hrms/leave/requests": ["hrms_leave_view", "hrms_leave_manage", "hrms_leave_approve"],
  "/hrms/leave/allocations": ["hrms_leave_view", "hrms_leave_manage"],
  "/hrms/leave/types": ["hrms_leave_view", "hrms_leave_manage"],
  "/hrms/leave/holidays": ["hrms_leave_view", "hrms_leave_manage"],
  "/hrms/leave/comp-off": ["hrms_leave_view", "hrms_leave_manage"],
  "/hrms/leave/allocation-requests": ["hrms_leave_view", "hrms_leave_manage", "hrms_leave_approve"],
  "/hrms/leave/accrual-plans": ["hrms_leave_view", "hrms_leave_manage"],
  "/hrms/leave/weekly-off": ["hrms_leave_view", "hrms_leave_manage"],
  "/hrms/payroll": ["hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/payroll/cockpit": ["hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/payroll/payslips": ["hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/payroll/salary-revisions": ["hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/payroll/statutory-settings": ["hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/payroll/salary-components": ["hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/payroll/penalties": ["hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/payroll/loans": ["hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/payroll/deposits": ["hrms_payroll_view", "hrms_payroll_manage"],
  "/hrms/asset": ["hrms_assets_view", "hrms_assets_manage"],
  "/hrms/asset/list": ["hrms_assets_view", "hrms_assets_manage"],
  "/hrms/asset/assignments": ["hrms_assets_view", "hrms_assets_manage"],
  "/hrms/pms": ["hrms_pms_view", "hrms_pms_manage"],
  "/hrms/pms/feedback": ["hrms_pms_view", "hrms_pms_manage"],
  "/hrms/pms/mpi": ["hrms_pms_view", "hrms_pms_manage"],
  "/hrms/helpdesk": ["hrms_employees_view", "hrms_employees_manage"],
  "/hrms/helpdesk/policies": ["hrms_documents_view", "hrms_documents_manage"],
  "/hrms/organization": ["hrms_employees_view", "hrms_employees_manage"],
  "/hrms/documents": ["hrms_documents_view", "hrms_documents_manage"],
  "/hrms/announcements": ["hrms_documents_view", "hrms_documents_manage"],
  "/hrms/mailbox": ["hrms_mailbox_view", "hrms_mailbox_manage"],
  "/hrms/disciplinary-actions": ["hrms_pms_view", "hrms_pms_manage"],
  "/hrms/reports": ["hrms_data_health_view", "hrms_payroll_view", "hrms_attendance_view", "hrms_leave_view"],
  "/hrms/registers": ["hrms_data_health_view", "hrms_payroll_view", "hrms_attendance_view", "hrms_leave_view"],
  "/hrms/logs": ["hrms_data_health_view", "hrms_manage"],
};

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
  const { hasAnyPermission, isLoading } = usePermissions();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  // Path the user just clicked — highlighted immediately so the nav responds
  // before the target page's chunk has finished loading.
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    setPendingPath(null);
  }, [location.pathname]);

  const prefetch = (path: string) => {
    if (!path.startsWith("http")) prefetchHrmsRoute(path.split("?")[0]);
  };

  const canAccessPath = useCallback((path: string) => {
    const permissions = HRMS_ROUTE_PERMISSIONS[path.split("?")[0]] || ["hrms_view", "hrms_manage"];
    return hasAnyPermission(expandPermissions(permissions));
  }, [hasAnyPermission]);

  const visibleNavGroups = useMemo<NavGroup[]>(
    () => navGroups
      .map((group) => ({
        ...group,
        items: group.items
          .map<NavItem | null>((item) => {
            const children = item.children?.filter((child) => canAccessPath(child.path));
            const itemVisible = canAccessPath(item.path) || Boolean(children?.length);
            return itemVisible ? { ...item, children } : null;
          })
          .filter((item): item is NavItem => item !== null),
      }))
      .filter((group) => group.items.length > 0),
    [canAccessPath]
  );

  // Auto-expand any parent group whose child matches current route
  useEffect(() => {
    const toExpand: string[] = [];
    visibleNavGroups.forEach((g) =>
      g.items.forEach((it) => {
        if (it.children?.some((c) => location.pathname.startsWith(c.path) || location.pathname === c.path)) {
          toExpand.push(it.label);
        }
      })
    );
    if (toExpand.length) {
      setExpandedItems((prev) => Array.from(new Set([...prev, ...toExpand])));
    }
  }, [location.pathname, visibleNavGroups]);

  if (isLoading) return null;

  const isActive = (path: string) => {
    // Entries may carry query strings (e.g. LOP focus view) — match on pathname only.
    const base = path.split("?")[0];
    const current = pendingPath ?? location.pathname;
    if (base === "/hrms") return current === "/hrms";
    return current.startsWith(base);
  };

  const isChildActive = (path: string) => (pendingPath ?? location.pathname) === path.split("?")[0];

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  };

  const handleNavigate = (path: string) => {
    if (path.startsWith("http")) {
      window.open(path, "_blank");
    } else {
      setPendingPath(path.split("?")[0]);
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
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#6C63FF]/10">
            <img src={blynkIcon} alt="BLYNK" className="w-6 h-6" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-white font-semibold text-xs tracking-tight">BLYNK VIRTUAL</span>
              <span className="text-white font-semibold text-xs tracking-tight">TECHNOLOGIES</span>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-4 sidebar-scroll">
        {visibleNavGroups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em] px-2 mb-1.5">
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
                    onMouseEnter={() => {
                      if (!isMobile && collapsed) setHoveredItem(item.label);
                      // Hover = intent: warm this section's chunks up front.
                      prefetch(item.path);
                      item.children?.slice(0, 4).forEach((c) => prefetch(c.path));
                    }}
                    onMouseLeave={() => !isMobile && collapsed && setHoveredItem(null)}
                  >
                    <button
                      onFocus={() => prefetch(item.path)}
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
                          : "text-muted-foreground hover:text-gray-200 hover:bg-[#252540]",
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
                          const childActive = isChildActive(child.path);
                          return (
                            <button
                              key={child.path}
                              onMouseEnter={() => prefetch(child.path)}
                              onFocus={() => prefetch(child.path)}
                              onClick={() => handleNavigate(child.path)}
                              className={cn(
                                "w-full text-left text-[13px] py-1.5 px-2 rounded-md transition-colors",
                                childActive ? "text-[#6C63FF] font-medium" : "text-muted-foreground hover:text-gray-300"
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
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {item.label}
                        </div>
                        {item.children!.map((child) => (
                          <button
                            key={child.path}
                            onMouseEnter={() => prefetch(child.path)}
                            onFocus={() => prefetch(child.path)}
                            onClick={() => handleNavigate(child.path)}
                            className={cn(
                              "w-full text-left text-sm py-2 px-3 transition-colors",
                              isChildActive(child.path)
                                ? "text-[#6C63FF] bg-[#6C63FF]/10"
                                : "text-muted-foreground hover:text-white hover:bg-[#252540]"
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
            className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-muted-foreground hover:text-gray-200 hover:bg-[#252540] transition-colors text-[13px]"
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

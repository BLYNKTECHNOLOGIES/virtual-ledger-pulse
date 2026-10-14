import { useState, useEffect, useMemo, useCallback } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  AlertTriangle,
  Mail,
  Inbox,
  ClipboardCheck,
  FileSpreadsheet,
  Target,
  UserSearch,
  ScrollText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { prefetchHrmsRoute } from "@/lib/hrmsPrefetch";
import { usePermissions } from "@/hooks/usePermissions";
import { expandPermissions } from "@/lib/permissions/catalog";

interface NavChild {
  label: string;
  path: string;
  /** Small heading shown above the first child of each section (e.g. "Reports", "Setup"). */
  section?: string;
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  children?: NavChild[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Grouped by what HR does: daily work first, reports and setup last in each list.
// Every path below is unchanged; only the grouping, order and section headings are presentation.
const navGroups: NavGroup[] = [
  {
    title: "HOME",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/hrms" },
      { label: "Requests", icon: Inbox, path: "/hrms/requests" },
    ],
  },
  {
    title: "PEOPLE",
    items: [
      {
        label: "Employees",
        icon: Users,
        path: "/hrms/employee",
        children: [
          { label: "Employee List", path: "/hrms/employee" },
          { label: "Onboarding", path: "/hrms/onboarding-pipeline" },
          { label: "Documents", path: "/hrms/employee/documents" },
          { label: "Separation", path: "/hrms/employee/separation" },
          { label: "F&F Settlement", path: "/hrms/offboarding/fnf" },
          { label: "Departments", path: "/hrms/employee/departments", section: "Setup" },
          { label: "Positions", path: "/hrms/employee/positions", section: "Setup" },
        ],
      },
      {
        label: "Recruitment (ATS)",
        icon: UserSearch,
        path: "/hrms/ats",
        children: [
          { label: "Overview", path: "/hrms/ats" },
          { label: "Candidates", path: "/hrms/ats/candidates" },
          { label: "Inbox", path: "/hrms/ats/inbox" },
          { label: "Interviews", path: "/hrms/ats/interviews" },
          { label: "Jobs", path: "/hrms/ats/jobs" },
          { label: "Reports", path: "/hrms/ats/reports" },
          { label: "Settings", path: "/hrms/ats/settings" },
        ],
      },
      {
        label: "Workforce Planning",
        icon: Target,
        path: "/hrms/workforce-planning",
        children: [
          { label: "Overview", path: "/hrms/workforce-planning" },
          { label: "Staffing Plan", path: "/hrms/workforce-planning/staffing-plan" },
          { label: "Capacity & Seats", path: "/hrms/workforce-planning/capacity-seats" },
          { label: "Hiring Requirements", path: "/hrms/workforce-planning/hiring-requirements" },
          { label: "Workforce Forecast", path: "/hrms/workforce-planning/forecast" },
        ],
      },
    ],
  },
  {
    title: "TIME & LEAVE",
    items: [
      {
        label: "Attendance",
        icon: Clock,
        path: "/hrms/attendance",
        children: [
          { label: "Overview", path: "/hrms/attendance" },
          { label: "Calendar View", path: "/hrms/attendance/calendar" },
          { label: "Regularization Requests", path: "/hrms/attendance/regularization" },
          { label: "Stale Sessions", path: "/hrms/attendance/stale-sessions" },
          { label: "Late Come / Early Out", path: "/hrms/attendance/late-early", section: "Reports" },
          { label: "Hours & Overtime", path: "/hrms/attendance/hours", section: "Reports" },
          { label: "Summary Report", path: "/hrms/attendance/summary", section: "Reports" },
          { label: "Raw Punches", path: "/hrms/attendance/punches", section: "Reports" },
          { label: "Shifts", path: "/hrms/attendance/shifts", section: "Setup" },
          { label: "Biometric Devices", path: "/hrms/attendance/biometric-devices", section: "Setup" },
          { label: "Period Locks", path: "/hrms/attendance/period-locks", section: "Setup" },
        ],
      },
      {
        label: "Leave",
        icon: CalendarDays,
        path: "/hrms/leave",
        children: [
          { label: "Dashboard", path: "/hrms/leave" },
          { label: "Requests", path: "/hrms/leave/requests" },
          { label: "Allocation Requests", path: "/hrms/leave/allocation-requests" },
          { label: "Comp-Off", path: "/hrms/leave/comp-off" },
          { label: "Allocations", path: "/hrms/leave/allocations" },
          { label: "Leave Types", path: "/hrms/leave/types", section: "Setup" },
          { label: "Holidays", path: "/hrms/leave/holidays", section: "Setup" },
          { label: "Weekly Off", path: "/hrms/leave/weekly-off", section: "Setup" },
          { label: "Accrual Plans", path: "/hrms/leave/accrual-plans", section: "Setup" },
        ],
      },
    ],
  },
  {
    title: "PAYROLL",
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
          { label: "Loans & Advances", path: "/hrms/payroll/loans" },
          { label: "Deposits", path: "/hrms/payroll/deposits" },
          { label: "Penalties", path: "/hrms/payroll/penalties" },
          { label: "Salary Components", path: "/hrms/payroll/salary-components", section: "Setup" },
          { label: "Statutory Settings", path: "/hrms/payroll/statutory-settings", section: "Setup" },
        ],
      },
    ],
  },
  {
    title: "WORKPLACE",
    items: [
      { label: "Mailbox", icon: Mail, path: "/hrms/mailbox" },
      { label: "Announcements", icon: Megaphone, path: "/hrms/announcements" },
      {
        label: "Helpdesk",
        icon: HelpCircle,
        path: "/hrms/helpdesk",
        children: [
          { label: "Tickets", path: "/hrms/helpdesk" },
          { label: "HR Policies", path: "/hrms/helpdesk/policies" },
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
        label: "Assets",
        icon: Laptop,
        path: "/hrms/asset",
        children: [
          { label: "Dashboard", path: "/hrms/asset" },
          { label: "All Assets", path: "/hrms/asset/list" },
          { label: "Assignments", path: "/hrms/asset/assignments" },
        ],
      },
      { label: "Documents", icon: FileText, path: "/hrms/documents" },
      { label: "Organization", icon: Building2, path: "/hrms/organization" },
      { label: "Disciplinary Actions", icon: AlertTriangle, path: "/hrms/disciplinary-actions" },
    ],
  },
  {
    title: "ASSESSMENTS",
    items: [
      {
        label: "Quiz",
        icon: ClipboardCheck,
        path: "/hrms/quiz",
        children: [
          { label: "Overview", path: "/hrms/quiz" },
          { label: "Drives", path: "/hrms/quiz?view=drives" },
          { label: "Results", path: "/hrms/quiz?view=results" },
          { label: "Grading", path: "/hrms/quiz?view=grading" },
          { label: "Tests", path: "/hrms/quiz?view=tests" },
          { label: "Question bank", path: "/hrms/quiz?view=questions" },
          { label: "Settings", path: "/hrms/quiz?view=settings" },
        ],
      },
    ],
  },
  {
    title: "INSIGHTS",
    items: [
      { label: "Reports", icon: BarChart3, path: "/hrms/reports" },
      { label: "Registers", icon: FileSpreadsheet, path: "/hrms/registers" },
      { label: "HR Logs", icon: ScrollText, path: "/hrms/logs" },
    ],
  },
];

/**
 * Page name for the browser tab, taken from this menu: the longest matching path wins, and a
 * generic child label ("Overview", "Dashboard") is replaced by its section name.
 */
export function hrmsNavLabel(pathname: string, search = ""): string | null {
  if (pathname === "/hrms" || pathname === "/hrms/") return "Dashboard";
  let best: { len: number; label: string } | null = null;
  const consider = (path: string, label: string) => {
    const [base, query] = path.split("?");
    if (base === "/hrms") return;
    if (pathname !== base && !pathname.startsWith(base + "/")) return;
    if (query && search !== `?${query}`) return;
    const len = base.length + (query ? query.length + 1 : 0);
    if (!best || len > best.len) best = { len, label };
  };
  for (const g of navGroups) {
    for (const it of g.items) {
      consider(it.path, it.label);
      for (const c of it.children ?? []) {
        const generic = c.label === "Overview" || c.label === "Dashboard";
        consider(c.path, generic ? it.label : c.label);
      }
    }
  }
  return (best as { len: number; label: string } | null)?.label ?? null;
}

// HRMS is a single, non-subdivided module: one HR owner manages every area.
// Every HRMS route is gated by the umbrella keys only.
const HRMS_ROUTE_PERMISSIONS: Record<string, string[]> = {
  "/hrms/quiz": ["hrms_quiz_view", "hrms_quiz_manage", "hrms_quiz_evaluate", "hrms_quiz_admin"],
};


interface HorillaSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  /** Hover-peek: panel floats above the content instead of pushing it. */
  peek?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function HorillaSidebar({
  collapsed,
  onToggle,
  isMobile = false,
  mobileOpen = false,
  onCloseMobile,
  peek = false,
  onMouseEnter,
  onMouseLeave,
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

  // Never unmount the shell on a permissions refetch — an unmounted <aside>
  // is what made the collapsible rail appear to vanish mid-session. Only the
  // very first load (no groups resolved yet) renders the quiet rail skeleton.
  const showSkeleton = isLoading && visibleNavGroups.length === 0;


  const isActive = (path: string) => {
  // Entries may carry query strings; parent items match on pathname.
    const base = path.split("?")[0];
    const current = pendingPath ?? location.pathname;
    if (base === "/hrms") return current === "/hrms";
    return current.startsWith(base);
  };

  const isChildActive = (path: string) => {
    const [pathname, query] = path.split("?");
    const current = pendingPath ?? location.pathname;
    if (pathname === "/hrms/ats") return current === pathname;
    if (pathname.startsWith("/hrms/ats/")) {
      if (pathname === "/hrms/ats/candidates" && current.startsWith("/hrms/ats/import")) return true;
      return current.startsWith(pathname);
    }
    if (current !== pathname) return false;
    if (!query) return !location.search;
    return location.search === `?${query}`;
  };

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  };

  // Menu entries are real links (open in a new tab works); a plain click also highlights the
  // entry at once and closes the phone drawer, as before.
  const onLinkClick = (e: React.MouseEvent, path: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    setPendingPath(path.split("?")[0]);
    if (isMobile) onCloseMobile?.();
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
      aria-label="HRMS menu"
      aria-hidden={isMobile && !mobileOpen ? true : undefined}
      {...(isMobile && !mobileOpen ? ({ inert: "" } as Record<string, string>) : {})}
      data-hrms-sidebar-peek={peek ? "true" : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "horilla-sidebar h-screen flex flex-col shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        "transition-[width,box-shadow] duration-200 ease-out will-change-[width]",
        isMobile
          ? cn(
              "fixed inset-y-0 left-0 z-50 w-[240px] transition-transform",
              mobileOpen ? "translate-x-0" : "-translate-x-full"
            )
          : cn(
              "absolute inset-y-0 left-0 z-40",
              collapsed ? "w-[68px]" : "w-[240px]",
              peek && "shadow-lg"
            )
      )}
    >

      <div className="h-14 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <BrandLogo variant={collapsed ? 'icon' : 'text'} className={collapsed ? 'h-8 w-8' : 'h-10 w-auto max-w-[190px]'} />
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="ml-auto -mr-1 rounded-lg p-2 text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-4 ds-nav-scroll">

        {showSkeleton &&
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`sk-${i}`}
               className="h-8 rounded-lg bg-sidebar-accent animate-pulse"
            />
          ))}

        {visibleNavGroups.map((group, groupIndex) => (
          <div key={group.title}>
            {!collapsed ? (
              <p className="text-[10px] font-semibold uppercase tracking-wider px-2 mb-1.5 text-muted-foreground">
                {group.title}
              </p>
            ) : (
              groupIndex > 0 && <div aria-hidden className="mx-2 mb-2 h-px bg-sidebar-border" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const hasChildren = !!item.children && item.children.length > 0;
                const childActive = hasChildren && item.children?.some((c) => isChildActive(c.path));
                const active = childActive || isActive(item.path);
                const expanded = expandedItems.includes(item.label);
                // A parent whose child is open is marked quietly (the child carries the highlight);
                // the filled style is for the page you are on, or for the rail when it's collapsed.
                const filled = active && (!hasChildren || collapsed);
                const rowClass = cn(
                  "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150",
                  filled
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : active
                      ? "text-primary font-semibold hover:bg-sidebar-accent"
                      : "text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent",
                  collapsed && "justify-center px-2"
                );

                const childList = (variant: "inline" | "flyout") => {
                  let lastSection: string | undefined;
                  return item.children?.map((child) => {
                    const on = isChildActive(child.path);
                    const heading = child.section && child.section !== lastSection ? child.section : null;
                    lastSection = child.section ?? lastSection;
                    return (
                      <div key={child.path}>
                        {heading && (
                          <p className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80",
                            variant === "inline" ? "px-2 pt-2 pb-0.5" : "px-3 pt-2 pb-1"
                          )}>
                            {heading}
                          </p>
                        )}
                        <Link
                          to={child.path}
                          aria-current={on ? "page" : undefined}
                          onMouseEnter={() => prefetch(child.path)}
                          onFocus={() => prefetch(child.path)}
                          onClick={(e) => onLinkClick(e, child.path)}
                          className={cn(
                            variant === "inline"
                              ? "block w-full text-left text-[13px] py-1.5 px-2 rounded-md transition-colors"
                              : "block w-full text-left text-sm py-2 px-3 transition-colors",
                            on
                              ? "bg-primary/10 text-primary font-medium"
                              : variant === "inline"
                                ? "text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
                                : "text-popover-foreground hover:bg-accent"
                          )}
                        >
                          {child.label}
                        </Link>
                      </div>
                    );
                  });
                };

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
                    {hasChildren ? (
                      <button
                        type="button"
                        onFocus={() => prefetch(item.path)}
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        aria-expanded={collapsed ? undefined : expanded}
                        onClick={() => {
                          if (!collapsed) {
                            toggleExpand(item.label);
                          } else {
                            handleNavigate(item.path);
                          }
                        }}
                        className={rowClass}
                      >
                        <item.icon className="h-[17px] w-[17px] shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left whitespace-nowrap animate-fade-in">{item.label}</span>
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                expanded && "rotate-180"
                              )}
                            />
                          </>
                        )}
                      </button>
                    ) : (
                      <Link
                        to={item.path}
                        onFocus={() => prefetch(item.path)}
                        onClick={(e) => onLinkClick(e, item.path)}
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={rowClass}
                      >
                        <item.icon className="h-[17px] w-[17px] shrink-0" />
                        {!collapsed && (
                          <span className="flex-1 text-left whitespace-nowrap animate-fade-in">{item.label}</span>
                        )}
                      </Link>
                    )}

                    {!collapsed && hasChildren && expanded && (
                      <div className="mt-0.5 ml-6 space-y-0.5 border-l border-sidebar-border pl-3">
                        {childList("inline")}
                      </div>
                    )}

                    {!isMobile && collapsed && hoveredItem === item.label && hasChildren && (
                      <div className="absolute left-full top-0 ml-2 bg-popover border border-border rounded-lg shadow-lg py-2 min-w-[200px] z-50">
                        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {item.label}
                        </div>
                        {childList("flyout")}
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
        <div className="px-3 py-3 border-t border-sidebar-border shrink-0">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : undefined}
            className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors text-[13px]"
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

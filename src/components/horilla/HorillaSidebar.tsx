
import { useState } from "react";
import {
  LayoutDashboard, Users, UserPlus, ClipboardList, Clock, CalendarDays,
  Wallet, Package, Target, LogOut, HelpCircle, ArrowRight, Leaf,
  FileText, Tag, CalendarCheck, GitPullRequest
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type HorillaModule =
  | "dashboard"
  | "employee"
  | "recruitment"
  | "onboarding"
  | "attendance"
  | "leave"
  | "payroll"
  | "asset"
  | "performance"
  | "offboarding"
  | "helpdesk";

export interface SubPage {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface HorillaSidebarProps {
  activeModule: HorillaModule;
  activeSubPage?: string;
  onModuleChange: (module: HorillaModule, subPage?: string) => void;
}

const subMenus: Partial<Record<HorillaModule, SubPage[]>> = {
  leave: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "my-requests", label: "My Leave Requests", icon: FileText },
    { id: "requests", label: "Leave Requests", icon: ClipboardList },
    { id: "types", label: "Leave Types", icon: Tag },
    { id: "assigned", label: "Assigned Leave", icon: CalendarCheck },
    { id: "allocation-requests", label: "Leave Allocation Request", icon: GitPullRequest },
  ],
};

const menuItems: { id: HorillaModule; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "recruitment", label: "Recruitment", icon: UserPlus },
  { id: "onboarding", label: "Onboarding", icon: ClipboardList },
  { id: "employee", label: "Employee", icon: Users },
  { id: "attendance", label: "Attendance", icon: Clock },
  { id: "leave", label: "Leave", icon: CalendarDays },
  { id: "payroll", label: "Payroll", icon: Wallet },
  { id: "asset", label: "Asset", icon: Package },
  { id: "performance", label: "Performance", icon: Target },
  { id: "offboarding", label: "Offboarding", icon: LogOut },
  { id: "helpdesk", label: "Helpdesk", icon: HelpCircle },
];

export function HorillaSidebar({ activeModule, activeSubPage, onModuleChange }: HorillaSidebarProps) {
  const [hoveredModule, setHoveredModule] = useState<HorillaModule | null>(null);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex flex-col h-full w-[60px] bg-white border-r border-gray-200 shrink-0 relative z-50">
        {/* Logo */}
        <div className="flex items-center justify-center py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-[#009C4A] flex items-center justify-center">
            <Leaf className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            const hasSub = !!subMenus[item.id];
            const isHovered = hoveredModule === item.id;

            return (
              <div
                key={item.id}
                className="relative"
                onMouseEnter={() => hasSub && setHoveredModule(item.id)}
                onMouseLeave={() => setHoveredModule(null)}
              >
                {hasSub ? (
                  <button
                    onClick={() => onModuleChange(item.id, "dashboard")}
                    className={cn(
                      "relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150",
                      isActive
                        ? "text-[#009C4A]"
                        : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-[-10px] top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#009C4A] rounded-r-full" />
                    )}
                    <Icon className="h-5 w-5" />
                  </button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onModuleChange(item.id)}
                        className={cn(
                          "relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150",
                          isActive
                            ? "text-[#009C4A]"
                            : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                        )}
                      >
                        {isActive && (
                          <div className="absolute left-[-10px] top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#009C4A] rounded-r-full" />
                        )}
                        <Icon className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-gray-800 text-white text-xs px-2 py-1">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Flyout sub-menu */}
                {hasSub && isHovered && (
                  <div className="absolute left-full top-0 ml-1 bg-white border border-gray-200 rounded-lg shadow-xl py-2 w-56 z-[100]">
                    <div className="px-3 py-1.5 text-xs font-bold text-gray-800 uppercase tracking-wide border-b border-gray-100 mb-1">
                      {item.label}
                    </div>
                    {subMenus[item.id]!.map((sub) => {
                      const SubIcon = sub.icon;
                      const isSubActive = isActive && activeSubPage === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => {
                            onModuleChange(item.id, sub.id);
                            setHoveredModule(null);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                            isSubActive
                              ? "bg-[#009C4A]/10 text-[#009C4A] font-semibold"
                              : "text-gray-600 hover:bg-gray-50"
                          )}
                        >
                          <SubIcon className="h-4 w-4 shrink-0" />
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom floating button */}
        <div className="flex items-center justify-center py-3 border-t border-gray-100">
          <button className="w-8 h-8 rounded-full bg-[#009C4A] flex items-center justify-center text-white hover:bg-[#008040] transition-colors shadow-md">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}

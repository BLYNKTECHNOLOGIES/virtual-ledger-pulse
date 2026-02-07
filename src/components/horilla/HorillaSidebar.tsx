
import { useState } from "react";
import {
  LayoutDashboard, Users, UserPlus, ClipboardList, Clock, CalendarDays,
  Wallet, Package, Target, LogOut, HelpCircle, ChevronLeft, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface HorillaSidebarProps {
  activeModule: HorillaModule;
  onModuleChange: (module: HorillaModule) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

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

export function HorillaSidebar({ activeModule, onModuleChange, collapsed, onToggleCollapse }: HorillaSidebarProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[#1e1e2d] text-white transition-all duration-300 relative",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="w-9 h-9 rounded-lg bg-[#E8604C] flex items-center justify-center font-bold text-lg shrink-0">
          H
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight truncate">Horilla HRMS</span>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onModuleChange(item.id)}
              className={cn(
                "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-[#E8604C] text-white shadow-md"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-20 w-6 h-6 bg-[#E8604C] rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-10"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

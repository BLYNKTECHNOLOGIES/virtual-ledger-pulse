
import { Bell, Moon, Settings, Globe, LayoutGrid, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { HorillaNotifications } from "./HorillaNotifications";
import { useState, useEffect } from "react";
import type { HorillaModule } from "./HorillaSidebar";

interface HorillaHeaderProps {
  activeModule: HorillaModule;
}

const moduleLabels: Record<HorillaModule, string> = {
  dashboard: "Dashboard",
  employee: "Employee",
  recruitment: "Recruitment",
  onboarding: "Onboarding",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payroll",
  asset: "Asset",
  performance: "Performance",
  offboarding: "Offboarding",
  helpdesk: "Helpdesk",
};

function RunningClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="text-sm font-mono text-gray-600 tabular-nums">
      {time.toLocaleTimeString("en-US", { hour12: false })}
    </span>
  );
}

export function HorillaHeader({ activeModule }: HorillaHeaderProps) {
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-[#009C4A] hover:underline font-medium"
        >
          Horilla
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-gray-700 font-medium">{moduleLabels[activeModule]}</span>
      </div>

      {/* Right: Clock + Icons + User */}
      <div className="flex items-center gap-2">
        <RunningClock />

        <div className="flex items-center gap-0.5 ml-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700">
            <Moon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700">
            <Settings className="h-4 w-4" />
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-gray-700 relative"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full">
                3
              </span>
            </Button>
            {showNotifications && (
              <HorillaNotifications onClose={() => setShowNotifications(false)} />
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700">
            <Globe className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>

        {/* User */}
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
          <div className="w-8 h-8 rounded-full bg-[#009C4A] flex items-center justify-center text-white text-xs font-bold">
            AD
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-semibold text-gray-800 leading-tight">Admin Demo</p>
            <p className="text-[10px] text-[#009C4A] leading-tight">● Online</p>
          </div>
        </div>
      </div>
    </header>
  );
}

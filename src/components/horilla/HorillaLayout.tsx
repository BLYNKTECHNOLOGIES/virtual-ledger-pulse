import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { HorillaSidebar } from "./HorillaSidebar";
import { HorillaHeader } from "./HorillaHeader";

export function HorillaLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="horilla-root flex h-screen overflow-hidden bg-[#f5f6fa]">
      <HorillaSidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <HorillaHeader onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

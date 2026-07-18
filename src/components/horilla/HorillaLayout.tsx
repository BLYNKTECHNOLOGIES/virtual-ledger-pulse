import { useState } from "react";
import { Outlet } from "react-router-dom";
import { HorillaSidebar } from "./HorillaSidebar";
import { HorillaHeader } from "./HorillaHeader";
import { useIsMobile } from "@/hooks/use-mobile";

export function HorillaLayout() {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }
    setSidebarCollapsed((prev) => !prev);
  };

  return (
    <div className="horilla-root flex h-screen w-full max-w-full overflow-hidden bg-muted/40 dark:bg-background">
      <HorillaSidebar
        collapsed={isMobile ? false : sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        isMobile={isMobile}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {isMobile && mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <HorillaHeader onToggleSidebar={handleToggleSidebar} isMobile={isMobile} />
        <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto p-2 sm:p-3 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

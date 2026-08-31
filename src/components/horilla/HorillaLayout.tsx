import { Suspense, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { HorillaSidebar } from "./HorillaSidebar";
import { HorillaHeader } from "./HorillaHeader";
import { HrmsRouteFallback } from "./HrmsRouteFallback";
import { RouteProgressBar } from "./RouteProgressBar";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useHrmsSidebarAutoCollapse,
  readHrmsSidebarCookie,
} from "@/hooks/useHrmsSidebarAutoCollapse";
import { RazorpayPushFeedbackProvider } from "@/components/hrms/RazorpayPushFeedbackProvider";
import { PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";


export function HorillaLayout() {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readHrmsSidebarCookie());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const workAreaRef = useRef<HTMLElement>(null);
  const { expandOnHover, collapseOnLeave, isPeeking, pinToggle } = useHrmsSidebarAutoCollapse(
    workAreaRef,
    sidebarCollapsed,
    setSidebarCollapsed,
  );

  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }
    pinToggle();
  };


  return (
    <PermissionGate
      permissions={["hrms_view", "hrms_manage"]}
      fallback={
        <div className="min-h-screen bg-muted/40 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <Shield className="h-10 w-10 text-muted-foreground" />
                <div>
                  <h2 className="text-lg font-semibold">Access Denied</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    HRMS is restricted to HR and administrative staff.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
    <div className="horilla-root flex h-screen w-full max-w-full overflow-hidden bg-muted/40 dark:bg-background">
      {/* Peek container: while peeking, the rail-width spacer stays put and the
          expanded panel floats above the content, so nothing reflows. */}
      <div
        className="relative shrink-0 transition-[width] duration-200 ease-out"
        style={
          isMobile
            ? undefined
            : { width: isPeeking || sidebarCollapsed ? 68 : 240 }
        }
        onMouseEnter={expandOnHover}
        onMouseLeave={collapseOnLeave}
      >
        <HorillaSidebar
          collapsed={isMobile ? false : sidebarCollapsed}
          onToggle={handleToggleSidebar}
          isMobile={isMobile}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          peek={!isMobile && isPeeking}
        />
      </div>

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
        <RouteProgressBar />
        {/* Suspense lives INSIDE the shell: page chunks suspend only this
            region, so the sidebar and header never unmount on navigation. */}
        <main
          ref={workAreaRef}
          className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto p-2 sm:p-3 md:p-6"
        >
          <Suspense fallback={<HrmsRouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <RazorpayPushFeedbackProvider />
    </div>
    </PermissionGate>
  );
}


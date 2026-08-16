import { useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";
import { SidebarEditProvider } from "@/contexts/SidebarEditContext";
import { PinUnlockProvider } from "@/contexts/PinUnlockContext";

import { NotificationProvider } from "@/contexts/NotificationContext";
import { ExchangeAccountProvider } from "@/contexts/ExchangeAccountContext";
import { MobileBottomNav } from "./MobileBottomNav";
import { HelpAssistantFab } from "./HelpAssistantFab";
import { TransactionDetailDialog } from "./transaction-detail";
import { ShortcutsProvider } from "@/contexts/ShortcutsProvider";
import { useIsStandby } from "@/hooks/useIsStandby";



/**
 * Collapses the desktop sidebar to the icon rail as soon as the user starts
 * working inside the main content area (click / type / scroll). Presentation
 * only — no logic or data behaviour changes.
 */
function MainWorkArea({ children }: { children: React.ReactNode }) {
  const { open, setOpen, isMobile } = useSidebar();
  const collapse = () => {
    if (!isMobile && open) setOpen(false);
  };
  return (
    <main
      className="flex-1 overflow-auto bg-background pb-16 md:pb-0"
      onPointerDown={collapse}
      onKeyDown={collapse}
      onWheel={collapse}
    >
      {children}
    </main>
  );
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { isStandby } = useIsStandby();

  // Persist sidebar expanded/collapsed (icon-rail) state across reloads.
  const defaultSidebarOpen =
    typeof document !== "undefined"
      ? document.cookie
          .split("; ")
          .find((c) => c.startsWith("sidebar:state="))
          ?.split("=")[1] !== "false"
      : true;
  return (
    <PinUnlockProvider>
      <SidebarEditProvider>
        <NotificationProvider>
          <ExchangeAccountProvider>
            <SidebarProvider defaultOpen={defaultSidebarOpen}>
              <ShortcutsProvider>
              <div className="flex w-full min-h-screen bg-background">
                {/* Desktop sidebar - hidden on mobile, hidden entirely for standby users */}
                {!isStandby && (
                  <div className="hidden md:block">
                    <AppSidebar />
                  </div>
                )}
                <SidebarInset className="flex flex-col flex-1 min-w-0">
                  <TopHeader />

                  <MainWorkArea>
                    <div key={location.pathname} className="page-mount">
                      {children}
                    </div>
                  </MainWorkArea>
                  {/* Mobile bottom navigation */}
                  {!isStandby && <MobileBottomNav />}

                  {/* Floating AI Help Assistant */}
                  <HelpAssistantFab />
                  {/* Global click-to-view transaction detail dialog */}
                  <TransactionDetailDialog />
                </SidebarInset>
              </div>
              </ShortcutsProvider>
            </SidebarProvider>
          </ExchangeAccountProvider>
          </NotificationProvider>
      </SidebarEditProvider>
    </PinUnlockProvider>
  );
}

import { useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";
import { SidebarEditProvider } from "@/contexts/SidebarEditContext";
import { PinUnlockProvider } from "@/contexts/PinUnlockContext";

import { NotificationProvider } from "@/contexts/NotificationContext";
import { ExchangeAccountProvider } from "@/contexts/ExchangeAccountContext";
import { MobileBottomNav } from "./MobileBottomNav";
import { HelpAssistantFab } from "./HelpAssistantFab";
import { TransactionDetailDialog } from "./transaction-detail";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
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
              <div className="flex w-full min-h-screen bg-slate-50">
                {/* Desktop sidebar - hidden on mobile */}
                <div className="hidden md:block">
                  <AppSidebar />
                </div>
                <SidebarInset className="flex flex-col flex-1 min-w-0">
                  <TopHeader />
                  <main className="flex-1 overflow-auto bg-slate-50 pb-16 md:pb-0">
                    <div key={location.pathname} className="page-mount">
                      {children}
                    </div>
                  </main>
                  {/* Mobile bottom navigation */}
                  <MobileBottomNav />
                  {/* Floating AI Help Assistant */}
                  <HelpAssistantFab />
                  {/* Global click-to-view transaction detail dialog */}
                  <TransactionDetailDialog />
                </SidebarInset>
              </div>
            </SidebarProvider>
          </ExchangeAccountProvider>
          </NotificationProvider>
      </SidebarEditProvider>
    </PinUnlockProvider>
  );
}

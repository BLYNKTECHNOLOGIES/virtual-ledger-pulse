import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";
import { SidebarEditProvider } from "@/contexts/SidebarEditContext";
import { PinUnlockProvider } from "@/contexts/PinUnlockContext";
import { OrderFocusProvider } from "@/contexts/OrderFocusContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { OrderAlertsProvider } from "@/contexts/OrderAlertsContext";
import { MobileBottomNav } from "./MobileBottomNav";
import { BuyOrderAlertWatcher } from "@/components/purchase/BuyOrderAlertWatcher";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <PinUnlockProvider>
      <SidebarEditProvider>
        <OrderFocusProvider>
          <NotificationProvider>
            <OrderAlertsProvider>
              <BuyOrderAlertWatcher />
              <SidebarProvider>
                <div className="flex w-full min-h-screen bg-background">
                  {/* Desktop sidebar - hidden on mobile */}
                  <div className="hidden md:block">
                    <AppSidebar />
                  </div>
                  <SidebarInset className="flex flex-col flex-1 min-w-0">
                    <TopHeader />
                    <main className="flex-1 overflow-auto bg-background pb-16 md:pb-0">
                      {children}
                    </main>
                    {/* Mobile bottom navigation */}
                    <MobileBottomNav />
                  </SidebarInset>
                </div>
              </SidebarProvider>
            </OrderAlertsProvider>
          </NotificationProvider>
        </OrderFocusProvider>
      </SidebarEditProvider>
    </PinUnlockProvider>
  );
}

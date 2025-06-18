
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

function LayoutContent({ children }: LayoutProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="flex h-screen w-full">
      <AppSidebar />
      <SidebarInset className={cn(
        "flex-1 flex flex-col transition-all duration-200 ease-in-out",
        isCollapsed ? "ml-0" : "ml-0" // Let SidebarInset handle the margin
      )}>
        <TopHeader />
        <main className={cn(
          "flex-1 overflow-auto bg-gray-50 transition-all duration-200 ease-in-out",
          "w-full" // Ensure full width utilization
        )}>
          <div className={cn(
            "h-full w-full transition-all duration-200 ease-in-out",
            isCollapsed ? "max-w-full" : "max-w-full" // Always use full width available
          )}>
            {children}
          </div>
        </main>
      </SidebarInset>
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
}

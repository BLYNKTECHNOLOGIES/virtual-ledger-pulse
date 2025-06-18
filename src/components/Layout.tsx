
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
      <SidebarInset className="flex-1 flex flex-col transition-all duration-300 ease-in-out w-full">
        <TopHeader />
        <main className="flex-1 overflow-auto bg-gray-50 w-full">
          <div className="h-full w-full">
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

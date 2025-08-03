
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";
import { SidebarEditProvider } from "@/contexts/SidebarEditContext";
import { ScrollToTop } from "./ScrollToTop";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarEditProvider>
      <SidebarProvider>
        <ScrollToTop />
        <div className="flex w-full min-h-screen bg-slate-50">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1 min-w-0">
            <TopHeader />
            <main className="flex-1 overflow-auto bg-slate-50">
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </SidebarEditProvider>
  );
}

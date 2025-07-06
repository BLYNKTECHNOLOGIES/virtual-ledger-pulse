
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex w-screen h-screen bg-slate-50 overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1 min-w-0">
          <TopHeader />
          <main className="flex-1 overflow-auto p-0 bg-slate-50">
            <div className="w-full h-full px-0">{children}</div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

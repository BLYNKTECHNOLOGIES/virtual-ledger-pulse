
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex w-screen min-h-screen overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col w-full">
          <TopHeader />
          <main className="flex-1 w-full overflow-auto">
            <div className="w-full h-full px-4">{children}</div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

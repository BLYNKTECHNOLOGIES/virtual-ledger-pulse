
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex w-screen max-w-none min-h-screen bg-gray-50 overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col w-full">
          <TopHeader />
          <main className="flex-1 overflow-auto w-full">
            <div className="w-full h-full">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

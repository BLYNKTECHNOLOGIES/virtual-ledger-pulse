
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen bg-gray-50">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col transition-all duration-300">
          <TopHeader />
          <main className="flex-1 transition-all duration-300 modern-scroll overflow-auto">
            <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

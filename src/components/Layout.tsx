
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col transition-all duration-300">
          <TopHeader />
          <main className="flex-1 transition-all duration-300 px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16 max-w-screen-2xl mx-auto w-full py-4 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}


import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { TopHeader } from "./TopHeader";
import { TopNav } from "./TopNav";
import { useLocation } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
}

const getPageName = (pathname: string): string => {
  const routes: Record<string, string> = {
    '/': 'Dashboard',
    '/sales': 'Sales',
    '/purchase': 'Purchase',
    '/bams': 'BAMS',
    '/clients': 'Clients',
    '/leads': 'Leads',
    '/user-management': 'User Management',
    '/hrms': 'HRMS',
    '/payroll': 'Payroll',
    '/compliance': 'Compliance',
    '/stock': 'Stock Management',
    '/accounting': 'Accounting'
  };
  
  if (pathname.startsWith('/clients/')) {
    return 'Client Details';
  }
  
  return routes[pathname] || 'Dashboard';
};

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const pageName = getPageName(location.pathname);

  return (
    <div className="flex h-screen w-full">
      <AppSidebar />
      <SidebarInset className="flex-1 flex flex-col">
        <TopHeader />
        <TopNav pageName={pageName} />
        <main className="flex-1 overflow-auto bg-gray-50">
          {children}
        </main>
      </SidebarInset>
    </div>
  );
}

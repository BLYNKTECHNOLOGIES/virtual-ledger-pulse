import { Home, Package, TrendingUp, ShoppingCart, Users, Menu, Terminal, Inbox } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePermissions } from "@/hooks/usePermissions";

interface MobileNavItem {
  title: string;
  url: string;
  icon: typeof Home;
  permissions: string[];
}

const mainNavItems: MobileNavItem[] = [
  { title: "Home", url: "/dashboard", icon: Home, permissions: ["dashboard_view"] },
  { title: "Stock", url: "/stock", icon: Package, permissions: ["stock_view", "stock_manage"] },
  { title: "Sales", url: "/sales", icon: TrendingUp, permissions: ["sales_view", "sales_manage"] },
  { title: "Purchase", url: "/purchase", icon: ShoppingCart, permissions: ["purchase_view", "purchase_manage"] },
];

const moreNavItems: MobileNavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: Home, permissions: ["dashboard_view"] },
  { title: "Stock Management", url: "/stock", icon: Package, permissions: ["stock_view", "stock_manage"] },
  { title: "Sales", url: "/sales", icon: TrendingUp, permissions: ["sales_view", "sales_manage"] },
  { title: "Purchase", url: "/purchase", icon: ShoppingCart, permissions: ["purchase_view", "purchase_manage"] },
  { title: "BAMS", url: "/bams", icon: Package, permissions: ["bams_view", "bams_manage"] },
  { title: "Clients", url: "/clients", icon: Users, permissions: ["clients_view", "clients_manage"] },
  { title: "Leads", url: "/leads", icon: Users, permissions: ["leads_view", "leads_manage"] },
  { title: "User Management", url: "/user-management", icon: Users, permissions: ["user_management_view", "user_management_manage"] },
  { title: "Compliance", url: "/compliance", icon: Package, permissions: ["compliance_view", "compliance_manage"] },
  { title: "Risk Management", url: "/risk-management", icon: Package, permissions: ["risk_management_view", "risk_management_manage"] },
  { title: "Video KYC", url: "/video-kyc", icon: Package, permissions: ["video_kyc_view", "video_kyc_manage"] },
  { title: "KYC Approvals", url: "/kyc-approvals", icon: Package, permissions: ["kyc_approvals_view", "kyc_approvals_manage"] },
  { title: "HRMS", url: "/hrms", icon: Users, permissions: ["hrms_view", "hrms_manage"] },
  { title: "Accounting", url: "/accounting", icon: Package, permissions: ["accounting_view", "accounting_manage"] },
  { title: "P&L", url: "/profit-loss", icon: TrendingUp, permissions: ["accounting_view", "accounting_manage"] },
  { title: "Financials", url: "/financials", icon: Package, permissions: ["accounting_view", "accounting_manage"] },
  { title: "Statistics", url: "/statistics", icon: TrendingUp, permissions: ["statistics_view", "statistics_manage"] },
  { title: "Tasks", url: "/tasks", icon: Users, permissions: ["tasks_view", "tasks_manage"] },
  { title: "ERP Entry", url: "/erp-entry", icon: Inbox, permissions: ["erp_entry_view", "erp_entry_manage"] },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { hasAnyPermission, isLoading } = usePermissions();

  const isTerminalActive = location.pathname.startsWith("/terminal");

  const visibleMainNavItems = useMemo(
    () => mainNavItems.filter((item) => hasAnyPermission(item.permissions)),
    [hasAnyPermission]
  );

  const visibleMoreNavItems = useMemo(
    () => moreNavItems.filter((item) => hasAnyPermission(item.permissions)),
    [hasAnyPermission]
  );

  if (isLoading) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t-2 border-gray-200 shadow-lg">
      <div className="flex items-center justify-around h-16 px-2">
        {visibleMainNavItems.map((item) => {
          const isActive = location.pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={`flex flex-col items-center justify-center flex-1 h-full px-1 py-2 transition-colors ${
                isActive
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <item.icon className={`h-5 w-5 ${isActive ? "text-blue-600" : ""}`} />
              <span className={`text-xs mt-1 truncate ${isActive ? "font-semibold" : ""}`}>
                {item.title}
              </span>
            </Link>
          );
        })}

        {/* More menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center justify-center flex-1 h-full px-1 py-2 text-gray-500 hover:text-gray-700 transition-colors">
              <Menu className="h-5 w-5" />
              <span className="text-xs mt-1">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
            <SheetHeader className="pb-4 border-b">
              <SheetTitle className="text-left">All Modules</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-full pb-8">
              <div className="grid grid-cols-3 gap-3 py-4">
                {visibleMoreNavItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <Link
                      key={item.url}
                      to={item.url}
                      onClick={() => setIsOpen(false)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl transition-colors ${
                        isActive
                          ? "bg-blue-50 text-blue-600 border-2 border-blue-200"
                          : "bg-gray-50 text-gray-700 hover:bg-gray-100 border-2 border-transparent"
                      }`}
                    >
                      <item.icon className="h-6 w-6 mb-2" />
                      <span className="text-xs text-center font-medium leading-tight">
                        {item.title}
                      </span>
                    </Link>
                  );
                })}

                {/* Terminal — full-width black button at the bottom of the grid */}
                <Link
                  to="/terminal"
                  onClick={() => setIsOpen(false)}
                  className={`col-span-3 flex items-center justify-center gap-3 px-6 py-4 rounded-xl transition-all mt-1 ${
                    isTerminalActive
                      ? "bg-zinc-700 text-white border-2 border-zinc-500"
                      : "bg-zinc-900 text-white border-2 border-zinc-900 hover:bg-zinc-800"
                  }`}
                >
                  <Terminal className="h-5 w-5" />
                  <span className="text-sm font-semibold tracking-widest uppercase">Terminal</span>
                </Link>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

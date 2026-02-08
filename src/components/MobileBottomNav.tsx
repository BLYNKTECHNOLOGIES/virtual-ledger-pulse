import { Home, Package, TrendingUp, ShoppingCart, Users, Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const mainNavItems = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Stock", url: "/stock", icon: Package },
  { title: "Sales", url: "/sales", icon: TrendingUp },
  { title: "Purchase", url: "/purchase", icon: ShoppingCart },
];

const moreNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Stock Management", url: "/stock", icon: Package },
  { title: "Sales", url: "/sales", icon: TrendingUp },
  { title: "Purchase", url: "/purchase", icon: ShoppingCart },
  { title: "BAMS", url: "/bams", icon: Package },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "User Management", url: "/user-management", icon: Users },
  { title: "Compliance", url: "/compliance", icon: Package },
  { title: "Risk Management", url: "/risk-management", icon: Package },
  { title: "Video KYC", url: "/video-kyc", icon: Package },
  { title: "KYC Approvals", url: "/kyc-approvals", icon: Package },
  { title: "HRMS", url: "/hrms", icon: Users },
  { title: "Payroll", url: "/payroll", icon: Package },
  { title: "EMS", url: "/ems", icon: Users },
  { title: "Accounting", url: "/accounting", icon: Package },
  { title: "P&L", url: "/profit-loss", icon: TrendingUp },
  { title: "Financials", url: "/financials", icon: Package },
  { title: "Statistics", url: "/statistics", icon: TrendingUp },
  { title: "Order Processing", url: "/order-processing", icon: Package },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t-2 border-gray-200 shadow-lg">
      <div className="flex items-center justify-around h-16 px-2">
        {mainNavItems.map((item) => {
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
                {moreNavItems.map((item) => {
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
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

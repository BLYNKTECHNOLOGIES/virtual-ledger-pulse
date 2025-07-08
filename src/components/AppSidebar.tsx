
import { Calendar, Home, Users, Building2, CreditCard, TrendingUp, UserCheck, Calculator, Scale, Package, BookOpen, ShoppingCart, Settings, UserPlus, PanelLeftClose, PanelLeftOpen, Video, Shield, BarChart3 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";

// Menu items with required permissions
const items = [{
  title: "Dashboard",
  url: "/dashboard",
  icon: Home,
  color: "text-blue-600",
  bgColor: "bg-blue-100",
  permissions: ["dashboard_view"]
}, {
  title: "Sales",
  url: "/sales",
  icon: TrendingUp,
  color: "text-emerald-600",
  bgColor: "bg-emerald-100",
  permissions: ["sales_view", "sales_manage"]
}, {
  title: "Purchase",
  url: "/purchase",
  icon: ShoppingCart,
  color: "text-purple-600",
  bgColor: "bg-purple-100",
  permissions: ["purchase_view", "purchase_manage"]
}, {
  title: "BAMS",
  url: "/bams",
  icon: Building2,
  color: "text-orange-600",
  bgColor: "bg-orange-100",
  permissions: ["bams_view", "bams_manage"]
}, {
  title: "Clients",
  url: "/clients",
  icon: Users,
  color: "text-cyan-600",
  bgColor: "bg-cyan-100",
  permissions: ["clients_view", "clients_manage"]
}, {
  title: "Leads",
  url: "/leads",
  icon: UserPlus,
  color: "text-teal-600",
  bgColor: "bg-teal-100",
  permissions: ["leads_view", "leads_manage"]
}, {
  title: "User Management",
  url: "/user-management",
  icon: Settings,
  color: "text-indigo-600",
  bgColor: "bg-indigo-100",
  permissions: ["user_management_view", "user_management_manage"]
}, {
  title: "HRMS",
  url: "/hrms",
  icon: UserCheck,
  color: "text-pink-600",
  bgColor: "bg-pink-100",
  permissions: ["hrms_view", "hrms_manage"]
}, {
  title: "Payroll",
  url: "/payroll",
  icon: Calculator,
  color: "text-blue-700",
  bgColor: "bg-blue-100",
  permissions: ["payroll_view", "payroll_manage"]
}, {
  title: "Compliance",
  url: "/compliance",
  icon: Scale,
  color: "text-red-600",
  bgColor: "bg-red-100",
  permissions: ["compliance_view", "compliance_manage"]
}, {
  title: "Stock Management",
  url: "/stock",
  icon: Package,
  color: "text-amber-600",
  bgColor: "bg-amber-100",
  permissions: ["stock_view", "stock_manage"]
}, {
  title: "Accounting",
  url: "/accounting",
  icon: BookOpen,
  color: "text-yellow-700",
  bgColor: "bg-yellow-100",
  permissions: ["accounting_view", "accounting_manage"]
}, {
  title: "Video KYC",
  url: "/video-kyc",
  icon: Video,
  color: "text-violet-600",
  bgColor: "bg-violet-100",
  permissions: ["video_kyc_view", "video_kyc_manage"]
}, {
  title: "KYC Approvals",
  url: "/kyc-approvals",
  icon: Shield,
  color: "text-blue-600",
  bgColor: "bg-blue-100",
  permissions: ["kyc_approvals_view", "kyc_approvals_manage"]
}, {
  title: "P&L",
  url: "/profit-loss",
  icon: TrendingUp,
  color: "text-teal-600",
  bgColor: "bg-teal-100",
  permissions: ["accounting_view", "accounting_manage"]
}, {
  title: "Financials",
  url: "/financials",
  icon: Calculator,
  color: "text-emerald-600",
  bgColor: "bg-emerald-100",
  permissions: ["accounting_view", "accounting_manage"]
}, {
  title: "EMS",
  url: "/ems",
  icon: UserCheck,
  color: "text-indigo-600",
  bgColor: "bg-indigo-100",
  permissions: ["hrms_view", "hrms_manage"]
}, {
  title: "Statistics",
  url: "/statistics",
  icon: BarChart3,
  color: "text-green-600",
  bgColor: "bg-green-100",
  permissions: ["statistics_view", "statistics_manage"]
}];

export function AppSidebar() {
  const {
    state,
    toggleSidebar
  } = useSidebar();
  const location = useLocation();
  const {
    hasAnyPermission,
    isLoading
  } = usePermissions();
  const isCollapsed = state === "collapsed";

  // Filter items based on user permissions
  const visibleItems = items.filter(item => !isLoading && hasAnyPermission(item.permissions));
  
  if (isLoading) {
    return (
      <Sidebar className="border-r-2 border-gray-200 bg-white shadow-lg">
        <SidebarHeader className="p-4 border-b-2 border-gray-100 bg-blue-600">
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 bg-white/20 rounded-lg animate-pulse"></div>
          </div>
        </SidebarHeader>
        
        <SidebarContent className="bg-white">
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="flex justify-center items-center h-20">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        
        <SidebarFooter className="p-4 border-t-2 border-gray-100 bg-gray-50">
          <Button variant="ghost" size="sm" onClick={toggleSidebar} className="text-gray-600 hover:bg-white hover:text-gray-800 ml-auto rounded-lg">
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar className="border-r-2 border-gray-200 bg-white shadow-lg" collapsible="icon">
      <SidebarHeader className="p-4 border-b-2 border-gray-100 bg-blue-600">
        <div className="flex items-center justify-center">
          <img 
            src="/lovable-uploads/421c0134-ad3f-4de9-889f-972a88a59561.png" 
            alt="Blynk Virtual Technologies Logo" 
            className="h-8 w-auto flex-shrink-0 bg-white/10 p-1 rounded-lg"
          />
          {!isCollapsed && (
            <div className="flex flex-col min-w-0 ml-3">
              <h2 className="text-base font-bold text-white tracking-tight leading-tight truncate">BLYNK VIRTUAL</h2>
              <p className="text-xs text-blue-100 font-medium -mt-0.5 truncate">TECHNOLOGIES</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      
      <SidebarContent className="bg-white">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2 px-2">
              {visibleItems.map(item => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className={`
                        hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-xl group border-2 border-transparent hover:border-gray-200 shadow-sm hover:shadow-md
                        ${isActive ? 'bg-blue-50 text-blue-700 font-semibold shadow-md border-blue-200 transform translate-x-1' : ''}
                      `}>
                      <Link to={item.url} className="flex items-center gap-3 px-3 py-3">
                        <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100' : item.bgColor} transition-all duration-200`}>
                          <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-blue-700' : item.color} transition-colors duration-200`} />
                        </div>
                        {!isCollapsed && (
                          <span className="font-medium text-sm truncate transition-all duration-200">
                            {item.title}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {visibleItems.length === 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="text-center py-8 text-gray-500">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Shield className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium">No accessible modules</p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      
      <SidebarFooter className="p-3 border-t-2 border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="text-xs text-gray-500 font-medium truncate flex-1 mr-2 bg-white px-2 py-1 rounded-lg shadow-sm">
              © 2025 BLYNK Virtual Technologies
            </div>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={toggleSidebar} 
            className="text-gray-600 hover:bg-white hover:text-gray-800 rounded-lg flex-shrink-0 border-2 border-transparent hover:border-gray-200 transition-all duration-200"
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

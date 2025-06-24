
import {
  Calendar,
  Home,
  Users,
  Building2,
  CreditCard,
  TrendingUp,
  UserCheck,
  Calculator,
  Scale,
  Package,
  BookOpen,
  ShoppingCart,
  Settings,
  UserPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Video,
  Shield,
  BarChart3,
} from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { usePermissions } from "@/hooks/usePermissions"

// Menu items with required permissions
const items = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    color: "text-blue-500",
    permissions: ["dashboard_view"]
  },
  {
    title: "Sales",
    url: "/sales",
    icon: TrendingUp,
    color: "text-emerald-500",
    permissions: ["sales_view", "sales_manage"]
  },
  {
    title: "Purchase",
    url: "/purchase",
    icon: ShoppingCart,
    color: "text-purple-500",
    permissions: ["purchase_view", "purchase_manage"]
  },
  {
    title: "BAMS",
    url: "/bams",
    icon: Building2,
    color: "text-orange-500",
    permissions: ["bams_view", "bams_manage"]
  },
  {
    title: "Clients",
    url: "/clients",
    icon: Users,
    color: "text-cyan-500",
    permissions: ["clients_view", "clients_manage"]
  },
  {
    title: "Leads",
    url: "/leads",
    icon: UserPlus,
    color: "text-teal-500",
    permissions: ["leads_view", "leads_manage"]
  },
  {
    title: "User Management",
    url: "/user-management",
    icon: Settings,
    color: "text-indigo-500",
    permissions: ["user_management_view", "user_management_manage"]
  },
  {
    title: "HRMS",
    url: "/hrms",
    icon: UserCheck,
    color: "text-pink-500",
    permissions: ["hrms_view", "hrms_manage"]
  },
  {
    title: "Payroll",
    url: "/payroll",
    icon: Calculator,
    color: "text-blue-600",
    permissions: ["payroll_view", "payroll_manage"]
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: Scale,
    color: "text-red-500",
    permissions: ["compliance_view", "compliance_manage"]
  },
  {
    title: "Stock Management",
    url: "/stock",
    icon: Package,
    color: "text-amber-500",
    permissions: ["stock_view", "stock_manage"]
  },
  {
    title: "Accounting",
    url: "/accounting",
    icon: BookOpen,
    color: "text-yellow-600",
    permissions: ["accounting_view", "accounting_manage"]
  },
  {
    title: "Video KYC",
    url: "/video-kyc",
    icon: Video,
    color: "text-violet-500",
    permissions: ["video_kyc_view", "video_kyc_manage"]
  },
  {
    title: "KYC Approvals",
    url: "/kyc-approvals",
    icon: Shield,
    color: "text-blue-500",
    permissions: ["kyc_approvals_view", "kyc_approvals_manage"]
  },
  {
    title: "Statistics",
    url: "/statistics",
    icon: BarChart3,
    color: "text-green-500",
    permissions: ["statistics_view", "statistics_manage"]
  },
]

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar()
  const location = useLocation()
  const { hasAnyPermission, isLoading } = usePermissions()
  const isCollapsed = state === "collapsed"

  // Filter items based on user permissions
  const visibleItems = items.filter(item => 
    !isLoading && hasAnyPermission(item.permissions)
  )

  if (isLoading) {
    return (
      <Sidebar className="bg-gradient-to-b from-slate-900 to-slate-800 border-slate-700/50">
        <SidebarHeader className="p-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            {!isCollapsed && (
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">BLYNK VIRTUAL</h2>
                <h3 className="text-sm font-medium text-slate-300">TECHNOLOGIES</h3>
                <p className="text-xs text-slate-400 mt-1">PRIVATE LIMITED</p>
              </div>
            )}
          </div>
        </SidebarHeader>
        
        <SidebarContent className="bg-gradient-to-b from-slate-900 to-slate-800 sidebar-scroll">
          <SidebarGroup>
            <SidebarGroupLabel className="text-slate-400 font-medium px-3">Loading...</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex justify-center items-center h-20">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-300"></div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        
        <SidebarFooter className="p-4 border-t border-slate-700/50">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={toggleSidebar}
            className="text-slate-300 hover:bg-slate-700/50 hover:text-white ml-auto transition-all duration-200"
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </SidebarFooter>
      </Sidebar>
    )
  }

  return (
    <Sidebar className="bg-gradient-to-b from-slate-900 to-slate-800 border-slate-700/50">
      <SidebarHeader className="p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          {!isCollapsed && (
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">BLYNK VIRTUAL</h2>
              <h3 className="text-sm font-medium text-slate-300">TECHNOLOGIES</h3>
              <p className="text-xs text-slate-400 mt-1">PRIVATE LIMITED</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      
      <SidebarContent className="bg-gradient-to-b from-slate-900 to-slate-800 sidebar-scroll">
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-400 font-medium px-3 text-xs uppercase tracking-wider">
            Application
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 px-2">
              {visibleItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      className={`
                        hover:bg-slate-700/50 text-slate-200 hover:text-white transition-all duration-200 rounded-lg
                        ${isActive ? 'bg-slate-600/70 text-white font-medium border border-slate-500/50 shadow-sm' : ''}
                      `}
                    >
                      <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                        <item.icon className={`h-5 w-5 ${isActive ? 'text-white' : item.color}`} />
                        {!isCollapsed && <span className="font-medium text-sm">{item.title}</span>}
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
              <div className="text-center py-8 text-slate-400">
                <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No accessible modules</p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      
      <SidebarFooter className="p-4 border-t border-slate-700/50">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="text-xs text-slate-400 font-medium">
              © 2025 BLYNK Virtual Technologies
            </div>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={toggleSidebar}
            className="text-slate-300 hover:bg-slate-700/50 hover:text-white ml-auto transition-all duration-200 rounded-lg"
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}


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
} from "lucide-react"

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

// Menu items.
const items = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    color: "text-blue-600"
  },
  {
    title: "Sales",
    url: "/sales",
    icon: TrendingUp,
    color: "text-green-600"
  },
  {
    title: "Purchase",
    url: "/purchase",
    icon: ShoppingCart,
    color: "text-purple-600"
  },
  {
    title: "BAMS",
    url: "/bams",
    icon: Building2,
    color: "text-orange-600"
  },
  {
    title: "Clients",
    url: "/clients",
    icon: Users,
    color: "text-cyan-600"
  },
  {
    title: "Leads",
    url: "/leads",
    icon: UserPlus,
    color: "text-emerald-600"
  },
  {
    title: "User Management",
    url: "/user-management",
    icon: Settings,
    color: "text-indigo-600"
  },
  {
    title: "HRMS",
    url: "/hrms",
    icon: UserCheck,
    color: "text-pink-600"
  },
  {
    title: "Payroll",
    url: "/payroll",
    icon: Calculator,
    color: "text-indigo-600"
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: Scale,
    color: "text-red-600"
  },
  {
    title: "Stock Management",
    url: "/stock",
    icon: Package,
    color: "text-teal-600"
  },
  {
    title: "Accounting",
    url: "/accounting",
    icon: BookOpen,
    color: "text-amber-600"
  },
]

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar className="bg-gradient-to-b from-blue-50 to-blue-100 border-blue-200">
      <SidebarHeader className="p-4 border-b border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isCollapsed && (
              <>
                <img 
                  src="/lovable-uploads/4205ce8e-c85a-484a-8110-c3a24054deab.png" 
                  alt="Blynk Virtual Technologies" 
                  className="h-8 w-auto"
                />
                <div>
                  <h2 className="text-xs font-semibold text-blue-900">BLYNK VIRTUAL TECHNOLOGIES</h2>
                  <p className="text-xs text-blue-700">PRIVATE LIMITED</p>
                  <p className="text-xs text-blue-600 mt-1">Leading Virtual Asset Service Provider</p>
                </div>
              </>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={toggleSidebar}
            className="text-blue-700 hover:bg-blue-200"
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-gradient-to-b from-blue-50 to-blue-100">
        <SidebarGroup>
          <SidebarGroupLabel className="text-blue-700 font-medium">Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="hover:bg-blue-200/50 data-[active=true]:bg-blue-300 text-blue-800 hover:text-blue-900">
                    <a href={item.url} className="flex items-center gap-3">
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                      {!isCollapsed && <span className="font-medium">{item.title}</span>}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-blue-200">
        {!isCollapsed && (
          <div className="text-xs text-blue-600">
            © 2025 BLYNK Virtual Technologies Pvt. Ltd.
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}

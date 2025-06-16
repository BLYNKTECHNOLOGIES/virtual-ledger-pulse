
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
} from "@/components/ui/sidebar"

// Menu items.
const items = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    title: "Sales",
    url: "/sales",
    icon: TrendingUp,
  },
  {
    title: "Purchase",
    url: "/purchase",
    icon: ShoppingCart,
  },
  {
    title: "BAMS",
    url: "/bams",
    icon: Building2,
  },
  {
    title: "Clients",
    url: "/clients",
    icon: Users,
  },
  {
    title: "HRMS",
    url: "/hrms",
    icon: UserCheck,
  },
  {
    title: "Payroll",
    url: "/payroll",
    icon: Calculator,
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: Scale,
  },
  {
    title: "Stock Management",
    url: "/stock",
    icon: Package,
  },
  {
    title: "Accounting",
    url: "/accounting",
    icon: BookOpen,
  },
]

export function AppSidebar() {
  return (
    <Sidebar className="bg-gradient-to-b from-blue-800 to-blue-900 border-r-0">
      <SidebarHeader className="p-4 bg-gradient-to-r from-blue-700 to-blue-800">
        <div className="flex items-center gap-3">
          <img 
            src="/lovable-uploads/25d24f27-f300-4057-b894-aa71e4e6fe12.png" 
            alt="Blynk Virtual Technologies" 
            className="h-8 w-auto"
          />
          <div>
            <h2 className="text-sm font-semibold text-white">BLYNK VIRTUAL</h2>
            <p className="text-xs text-blue-200">TECHNOLOGIES</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-gradient-to-b from-blue-800 to-blue-900">
        <SidebarGroup>
          <SidebarGroupLabel className="text-blue-200 font-medium">MAIN MENU</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="text-blue-100 hover:bg-blue-700/50 hover:text-white data-[active]:bg-blue-600 data-[active]:text-white transition-colors">
                    <a href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 bg-gradient-to-r from-blue-800 to-blue-900">
        <div className="text-xs text-blue-200">
          © 2025 BLYNK Virtual Technologies
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

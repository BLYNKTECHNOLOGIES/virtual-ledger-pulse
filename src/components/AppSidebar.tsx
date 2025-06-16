
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
  return (
    <Sidebar className="bg-gradient-to-b from-blue-900 to-blue-800 border-blue-700">
      <SidebarHeader className="p-4 border-b border-blue-700">
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
      <SidebarContent className="bg-gradient-to-b from-blue-900 to-blue-800">
        <SidebarGroup>
          <SidebarGroupLabel className="text-blue-200 font-medium">Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="hover:bg-blue-700/50 data-[active=true]:bg-blue-600 text-blue-100 hover:text-white">
                    <a href={item.url} className="flex items-center gap-3">
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                      <span className="font-medium">{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-blue-700">
        <div className="text-xs text-blue-200">
          © 2025 BLYNK Virtual Technologies
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

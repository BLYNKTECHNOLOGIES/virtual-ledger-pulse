
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
    title: "BAMS",
    url: "/bams",
    icon: Building2,
  },
  {
    title: "Banking",
    url: "/banking",
    icon: CreditCard,
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
    <Sidebar>
      <SidebarHeader className="p-4">
        <h2 className="text-lg font-semibold text-primary">BLYNK Virtual Technologies</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="text-xs text-muted-foreground">
          © 2025 BLYNK Virtual Technologies
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

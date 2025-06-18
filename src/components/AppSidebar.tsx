
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  DollarSign,
  ShoppingCart,
  CreditCard,
  Users,
  UserPlus,
  Building2,
  Calculator,
  Package,
  FileText,
  Shield,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: BarChart3,
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
    icon: CreditCard,
  },
  {
    title: "Clients",
    url: "/clients",
    icon: Users,
  },
  {
    title: "Leads",
    url: "/leads", 
    icon: UserPlus,
  },
  {
    title: "User Management",
    url: "/user-management",
    icon: Shield,
  },
  {
    title: "HRMS",
    url: "/hrms",
    icon: Building2,
  },
  {
    title: "Payroll",
    url: "/payroll",
    icon: DollarSign,
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: FileText,
  },
  {
    title: "Stock Management",
    url: "/stock",
    icon: Package,
  },
  {
    title: "Accounting",
    url: "/accounting",
    icon: Calculator,
  },
];

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <div className="flex flex-col items-center space-y-2">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <div className="text-left">
              <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent leading-tight">
                Blynk Virtual
              </h1>
              <p className="text-sm font-medium text-gray-600 -mt-1">
                Technologies
              </p>
            </div>
          </div>
          <div className="w-full h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent"></div>
          <p className="text-xs text-gray-500 font-medium tracking-wide">
            ENTERPRISE MANAGEMENT
          </p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="hover:bg-blue-50 hover:text-blue-700 transition-colors">
                    <Link to={item.url} className="flex items-center space-x-3 py-2.5">
                      <item.icon className="h-4 w-4" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}


import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home,
  User,
  Settings,
  Database,
  Banknote,
  Shield,
  Clock,
  List,
  Bell,
  ShoppingCart,
  CreditCard,
  Users,
  Calculator,
  FileText
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navigationItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Sales Order", url: "/sales", icon: ShoppingCart },
  { title: "BAMS", url: "/bams", icon: CreditCard },
  { title: "Banking", url: "/banking", icon: Banknote },
  { title: "Payment Methods", url: "/payment-methods", icon: Database },
  { title: "Clients", url: "/clients", icon: User },
  { title: "Risk", url: "/risk", icon: Shield },
  { title: "HRMS", url: "/hrms", icon: Users },
  { title: "Payroll", url: "/payroll", icon: Calculator },
  { title: "Compliance", url: "/compliance", icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar className={collapsed ? "w-14" : "w-64"} collapsible="icon">
      <div className="p-4 border-b bg-blue-600">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
            <span className="text-blue-600 font-bold text-sm">B</span>
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-bold text-white text-sm">Blynk ERP</h2>
              <p className="text-blue-200 text-xs">Virtual Technologies</p>
            </div>
          )}
        </div>
      </div>

      <SidebarTrigger className="m-2 self-end" />

      <SidebarContent className="bg-gray-900 text-white">
        <SidebarGroup>
          <SidebarGroupLabel className="text-gray-400 uppercase text-xs font-semibold">
            {!collapsed && "MAIN MENU"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "bg-blue-600 text-white"
                            : "text-gray-300 hover:bg-gray-800 hover:text-white"
                        }`
                      }
                    >
                      <item.icon className="h-5 w-5" />
                      {!collapsed && <span className="font-medium">{item.title}</span>}
                    </NavLink>
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

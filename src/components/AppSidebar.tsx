
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
  Info,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Menu items with detailed descriptions
const items = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    description: "Overview of all modules and key metrics"
  },
  {
    title: "Sales",
    url: "/sales",
    icon: TrendingUp,
    description: "🧾 Sales Order Processing - Central module for tracking and processing all incoming sales orders across platforms",
    detailedInfo: `
🎯 Key Features:
• Record sales orders from different platforms
• Fetch client history and risk details (new/existing)
• Auto-validate against COSMOS limits
• Generate UPI/bank details dynamically
• Classify orders: Completed, Cancelled, Alternative Payment

🔄 Workflow:
1. Choose Order Type (Repeat/New Client)
2. Enter Amount (COSMOS validation)  
3. Payment Method Assignment (UPI/Bank)
4. Order Actions (Cancel/Alternative/Received)
5. Final Sales Entry with full metadata

📊 Features:
• Real-time status tracking
• Search & filter by platform, client, date
• Status indicators (Green/Yellow/Red)
• Export reports (Excel/PDF)
• Auto-sync to Accounting & CRM
    `
  },
  {
    title: "Purchase",
    url: "/purchase",
    icon: ShoppingCart,
    description: "Manage purchase orders and supplier relationships"
  },
  {
    title: "BAMS",
    url: "/bams",
    icon: Building2,
    description: "Bank Account Management System - Central database for all bank accounts and payment methods"
  },
  {
    title: "Clients",
    url: "/clients",
    icon: Users,
    description: "Client Relationship Management with KYC, limits, and risk scoring"
  },
  {
    title: "HRMS",
    url: "/hrms",
    icon: UserCheck,
    description: "Human Resource Management System"
  },
  {
    title: "Payroll",
    url: "/payroll",
    icon: Calculator,
    description: "Employee payroll and compensation management"
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: Scale,
    description: "Legal and regulatory compliance management"
  },
  {
    title: "Stock Management",
    url: "/stock",
    icon: Package,
    description: "Inventory and warehouse management system"
  },
  {
    title: "Accounting",
    url: "/accounting",
    icon: BookOpen,
    description: "Financial accounting and ledger management"
  },
]

export function AppSidebar() {
  return (
    <TooltipProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <img 
              src="/lovable-uploads/25d24f27-f300-4057-b894-aa71e4e6fe12.png" 
              alt="Blynk Virtual Technologies" 
              className="h-8 w-auto"
            />
            <div>
              <h2 className="text-sm font-semibold text-primary">BLYNK VIRTUAL</h2>
              <p className="text-xs text-muted-foreground">TECHNOLOGIES</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Application</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <a href={item.url} className="flex items-center justify-between">
                            <div className="flex items-center">
                              <item.icon />
                              <span>{item.title}</span>
                            </div>
                            {item.detailedInfo && (
                              <Info className="h-3 w-3 text-muted-foreground ml-2" />
                            )}
                          </a>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-sm p-4">
                        <div className="space-y-2">
                          <p className="font-medium text-sm">{item.description}</p>
                          {item.detailedInfo && (
                            <div className="text-xs text-muted-foreground whitespace-pre-line">
                              {item.detailedInfo}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
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
    </TooltipProvider>
  )
}

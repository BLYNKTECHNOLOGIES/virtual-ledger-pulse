
import React from 'react';
import { Home, Users, FileText, TrendingUp, Package, Calculator, Shield, UserCheck, BarChart3, Briefcase, DollarSign, AlertTriangle, Boxes, CreditCard, Video, CheckCircle, PieChart, Building, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { usePermissions } from '@/hooks/usePermissions';

const navigationItems = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: Home,
    permission: 'dashboard_view'
  },
  {
    title: 'Sales',
    url: '/sales',
    icon: TrendingUp,
    permission: 'sales_view'
  },
  {
    title: 'Purchase',
    url: '/purchase',
    icon: Package,
    permission: 'purchase_view'
  },
  {
    title: 'BAMS',
    url: '/bams',
    icon: Calculator,
    permission: 'bams_view'
  },
  {
    title: 'Clients',
    url: '/clients',
    icon: Users,
    permission: 'clients_view'
  },
  {
    title: 'Leads',
    url: '/leads',
    icon: FileText,
    permission: 'leads_view'
  },
  {
    title: 'User Management',
    url: '/user-management',
    icon: UserCheck,
    permission: 'user_management_view'
  },
  {
    title: 'HRMS',
    url: '/hrms',
    icon: Briefcase,
    permission: 'hrms_view'
  },
  {
    title: 'Payroll',
    url: '/payroll',
    icon: DollarSign,
    permission: 'payroll_view'
  },
  {
    title: 'Compliance',
    url: '/compliance',
    icon: AlertTriangle,
    permission: 'compliance_view'
  },
  {
    title: 'Stock Management',
    url: '/stock',
    icon: Boxes,
    permission: 'stock_view'
  },
  {
    title: 'Accounting',
    url: '/accounting',
    icon: CreditCard,
    permission: 'accounting_view'
  },
  {
    title: 'Video KYC',
    url: '/video-kyc',
    icon: Video,
    permission: 'video_kyc_view'
  },
  {
    title: 'KYC Approvals',
    url: '/kyc-approvals',
    icon: CheckCircle,
    permission: 'kyc_approvals_view'
  },
  {
    title: 'Statistics',
    url: '/statistics',
    icon: PieChart,
    permission: 'statistics_view'
  },
  {
    title: 'Banking',
    url: '/banking',
    icon: Building,
    permission: 'banking_view'
  }
];

export function AppSidebar() {
  const location = useLocation();
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <Sidebar>
        <SidebarContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }

  const filteredItems = navigationItems.filter(item => hasPermission(item.permission));

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <img 
                src="/lovable-uploads/95dfb015-8a6a-4ff4-b8e5-b77bb62d6d08.png" 
                alt="Blynk Virtual Technologies" 
                className="h-8 w-auto"
              />
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location.pathname === item.url}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
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

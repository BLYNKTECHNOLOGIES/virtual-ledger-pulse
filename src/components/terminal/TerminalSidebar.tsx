import { useLocation, Link } from 'react-router-dom';
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
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Megaphone,
  ShoppingCart,
  Bot,
  Settings,
  Activity,
  Users,
  Building2,
} from 'lucide-react';
import { useBinanceActiveOrders } from '@/hooks/useBinanceActions';
import { useTerminalAuth, TerminalPermission } from '@/hooks/useTerminalAuth';

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  showActiveCount?: boolean;
  badge?: string;
  requiredPermission?: TerminalPermission;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', url: '/terminal', icon: LayoutDashboard, requiredPermission: 'terminal_dashboard_view' },
  { title: 'Ads Manager', url: '/terminal/ads', icon: Megaphone, requiredPermission: 'terminal_ads_view' },
  { title: 'Orders', url: '/terminal/orders', icon: ShoppingCart, showActiveCount: true, requiredPermission: 'terminal_orders_view' },
  { title: 'Automation', url: '/terminal/automation', icon: Bot, requiredPermission: 'terminal_automation_view' },
  { title: 'Analytics', url: '/terminal/analytics', icon: Activity, requiredPermission: 'terminal_analytics_view' },
  { title: 'Users & Roles', url: '/terminal/users', icon: Users, requiredPermission: 'terminal_users_view' },
  { title: 'Settings', url: '/terminal/settings', icon: Settings, badge: 'Soon', requiredPermission: 'terminal_settings_view' },
];

export function TerminalSidebar() {
  const location = useLocation();
  const { data: activeOrdersData } = useBinanceActiveOrders();
  const { hasPermission, terminalPermissions, isLoading } = useTerminalAuth();

  const activeCount = (() => {
    if (!activeOrdersData) return 0;
    const list = activeOrdersData?.data || activeOrdersData?.list || [];
    if (!Array.isArray(list)) return 0;
    return list.filter((o: any) => {
      const s = typeof o.orderStatus === 'number' ? o.orderStatus : 0;
      return s >= 1 && s <= 3;
    }).length;
  })();

  const isActive = (url: string) => {
    if (url === '/terminal') return location.pathname === '/terminal';
    return location.pathname.startsWith(url);
  };

  // If no terminal role assigned, show all nav items (unrestricted until role is assigned)
  const showAll = !isLoading && terminalPermissions.length === 0;

  const visibleItems = navItems.filter((item) => {
    if (showAll) return true;
    if (!item.requiredPermission) return true;
    return hasPermission(item.requiredPermission);
  });

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-3.5 border-b border-sidebar-border">
        <Link to="/terminal" className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="text-primary font-bold text-[9px] tracking-tight">P2P</span>
          </div>
          <div>
            <h1 className="text-[13px] font-semibold text-sidebar-accent-foreground tracking-tight">Terminal</h1>
            <p className="text-[9px] text-sidebar-foreground leading-none mt-0.5">Trading Operations</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2.5">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.12em] text-sidebar-foreground px-3 mb-1">
            Operations
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className="h-8 gap-2 text-[12px] rounded transition-colors"
                  >
                    <Link to={item.url}>
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">{item.title}</span>
                      {item.showActiveCount && activeCount > 0 && (
                        <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[9px] font-bold bg-trade-pending text-background rounded-full tabular-nums px-1">
                          {activeCount}
                        </span>
                      )}
                      {item.badge && (
                        <span className="text-[8px] bg-sidebar-accent text-sidebar-foreground px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-sidebar-border">
        <Link to="/dashboard">
          <Button
            variant="ghost"
            className="w-full h-8 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-amber-400 hover:from-gray-800 hover:via-gray-700 hover:to-gray-800 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 shadow-lg hover:shadow-amber-500/10 transition-all duration-300 font-semibold tracking-wide text-xs"
          >
            <Building2 className="h-3.5 w-3.5 mr-2" />
            ERP Dashboard
          </Button>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}

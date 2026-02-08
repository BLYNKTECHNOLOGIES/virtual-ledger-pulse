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
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Megaphone,
  ShoppingCart,
  Bot,
  Settings,
  Activity,
} from 'lucide-react';
import { useBinanceActiveOrders } from '@/hooks/useBinanceActions';

const navItems = [
  { title: 'Dashboard', url: '/terminal', icon: LayoutDashboard },
  { title: 'Ads Manager', url: '/terminal/ads', icon: Megaphone },
  { title: 'Orders', url: '/terminal/orders', icon: ShoppingCart, showActiveCount: true },
  { title: 'Automation', url: '/terminal/automation', icon: Bot, badge: 'Soon' },
  { title: 'Analytics', url: '/terminal/analytics', icon: Activity, badge: 'Soon' },
  { title: 'Settings', url: '/terminal/settings', icon: Settings, badge: 'Soon' },
];

export function TerminalSidebar() {
  const location = useLocation();
  const { data: activeOrdersData } = useBinanceActiveOrders();

  // Count active orders for badge
  const activeCount = (() => {
    if (!activeOrdersData) return 0;
    const list = activeOrdersData?.data || activeOrdersData?.list || [];
    if (!Array.isArray(list)) return 0;
    // Only count truly active orders (status 1-3: pending, trading, buyer notified)
    // Status 4+ can include completed/cancelled orders returned by listOrders
    return list.filter((o: any) => {
      const s = typeof o.orderStatus === 'number' ? o.orderStatus : 0;
      return s >= 1 && s <= 3;
    }).length;
  })();

  const isActive = (url: string) => {
    if (url === '/terminal') return location.pathname === '/terminal';
    return location.pathname.startsWith(url);
  };

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
              {navItems.map((item) => (
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
    </Sidebar>
  );
}

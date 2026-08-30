import { useLocation, Link } from 'react-router-dom';
import blynkIcon from "@/assets/brand/blynk-icon.svg";
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
  useSidebar,
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
  Wallet,
  ScrollText,
  BarChart3,
  UserCheck,
  CreditCard,
  Coins,
  Gavel,
  Clock,
  Keyboard,
  TerminalSquare,
} from 'lucide-react';
import { useBinanceActiveOrders } from '@/hooks/useBinanceActions';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import type { TerminalPermission } from '@/lib/permissions/terminalCatalog';
import { usePayerOrders } from '@/hooks/usePayerModule';
import { usePendingAppealCheckInCount } from '@/hooks/useTerminalAppeals';

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  /** Semantic tint key -> maps to a `t-nav-<tone>` chip class in index.css */
  tone: 'neutral' | 'primary' | 'buy' | 'pending' | 'sell' | 'success' | 'info' | 'warning' | 'muted';
  showActiveCount?: boolean;
  showPayerPendingCount?: boolean;
  showAppealPendingCount?: boolean;
  badge?: string;
  requiredPermission?: TerminalPermission;
  comingSoon?: boolean;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', url: '/terminal/dashboard', icon: LayoutDashboard, tone: 'primary', requiredPermission: 'terminal_dashboard_view' },
  { title: 'Ads Manager', url: '/terminal/ads', icon: Megaphone, tone: 'buy', requiredPermission: 'terminal_ads_view' },
  { title: 'Orders', url: '/terminal/orders', icon: ShoppingCart, tone: 'pending', showActiveCount: true, requiredPermission: 'terminal_orders_view' },
  { title: 'Automation', url: '/terminal/automation', icon: Bot, tone: 'info', requiredPermission: 'terminal_pricing_view' },
  { title: 'Assets', url: '/terminal/assets', icon: Wallet, tone: 'success', requiredPermission: 'terminal_assets_view' },
  { title: 'Analytics', url: '/terminal/analytics', icon: Activity, tone: 'info', requiredPermission: 'terminal_analytics_view' },
  { title: 'MPI', url: '/terminal/mpi', icon: BarChart3, tone: 'primary', requiredPermission: 'terminal_mpi_view_own' },
  { title: 'Audit Logs', url: '/terminal/audit-logs', icon: ScrollText, tone: 'muted', requiredPermission: 'terminal_audit_logs_view' },
  { title: 'KYC Team', url: '/terminal/kyc', icon: UserCheck, tone: 'info', requiredPermission: 'terminal_kyc_view', comingSoon: true },
  { title: 'Payer', url: '/terminal/payer', icon: CreditCard, tone: 'success', showPayerPendingCount: true, requiredPermission: 'terminal_payer_view' },
  { title: 'Appeals', url: '/terminal/appeals', icon: Gavel, tone: 'sell', showAppealPendingCount: true, requiredPermission: 'terminal_appeals_view' },
  { title: 'Small Payments', url: '/terminal/small-payments', icon: Coins, tone: 'warning', requiredPermission: 'terminal_small_payments_view' },
  { title: 'Logs', url: '/terminal/logs', icon: TerminalSquare, tone: 'muted', requiredPermission: 'terminal_logs_view' },
  { title: 'Users & Roles', url: '/terminal/users', icon: Users, tone: 'primary', requiredPermission: 'terminal_users_view' },
  { title: 'Settings', url: '/terminal/settings', icon: Settings, tone: 'neutral', requiredPermission: 'terminal_settings_view' },
  { title: 'Shortcuts', url: '/terminal/shortcuts', icon: Keyboard, tone: 'neutral' },
];

export function TerminalSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const { data: activeOrdersData } = useBinanceActiveOrders();
  const { orders: payerPendingOrders = [] } = usePayerOrders();
  const { data: pendingAppealCheckInCount = 0 } = usePendingAppealCheckInCount();
  const { hasPermission } = useTerminalAuth();

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
    // Root landing (/terminal) renders the Orders page for order-viewers,
    // so highlight the Orders nav item there too.
    if (url === '/terminal/orders') {
      return location.pathname === '/terminal' || location.pathname.startsWith('/terminal/orders');
    }
    return location.pathname.startsWith(url);
  };

  // Only show items user has permission for (no fallback to show all)
  const visibleItems = navItems.filter((item) => {
    if (!item.requiredPermission) return true;
    return hasPermission(item.requiredPermission);
  });

  const countFor = (item: NavItem) => {
    if (item.showActiveCount) return activeCount;
    if (item.showPayerPendingCount) return payerPendingOrders.length;
    if (item.showAppealPendingCount) return pendingAppealCheckInCount;
    return 0;
  };

  return (
    <Sidebar className="border-r border-sidebar-border" collapsible="icon">
      <SidebarHeader
        className={`border-b border-sidebar-border ${isCollapsed ? 'px-0 py-3' : 'px-4 py-3.5'}`}
      >
        <Link
          to="/terminal"
          aria-label="Terminal"
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}
        >
          <div className="h-7 w-7 shrink-0 rounded bg-primary/10 border border-primary/20 flex items-center justify-center">
            <img src={blynkIcon} alt="BLYNK" className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="text-[13px] font-semibold text-sidebar-accent-foreground tracking-tight">Terminal</h1>
              <p className="text-[9px] text-sidebar-foreground leading-none mt-0.5">Trading Operations</p>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className={`ds-nav-scroll overflow-x-hidden py-2.5 ${isCollapsed ? 'px-0' : 'px-2'}`}>
        <SidebarGroup className={isCollapsed ? 'px-0' : undefined}>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground px-3 mb-1">
              Operations
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className={isCollapsed ? 'gap-1.5 items-center' : 'gap-0.5'}>
              {visibleItems.map((item) => {
                const active = isActive(item.url);
                const count = countFor(item);
                return (
                  <SidebarMenuItem key={item.title} className={isCollapsed ? 'flex justify-center' : undefined}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={isCollapsed ? item.title : undefined}
                      className="h-auto p-0 hover:bg-transparent group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0"
                    >
                      <Link
                        to={item.url}
                        aria-label={item.title}
                        className="ds-nav-row t-nav-row"
                        data-collapsed={isCollapsed}
                        data-active={active}
                      >
                        <span className={`ds-nav-icon t-nav-icon t-nav-${item.tone}`}>
                          <item.icon className="h-[18px] w-[18px]" />
                          {isCollapsed && count > 0 && (
                            <span className="t-nav-dot" aria-hidden="true" />
                          )}
                        </span>
                        {!isCollapsed && (
                          <>
                            <span className="ds-nav-label">{item.title}</span>
                            {count > 0 && (
                              <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[9px] font-bold bg-trade-pending/15 text-trade-pending rounded-full t-mono px-1">
                                {count}
                              </span>
                            )}
                            {item.comingSoon && (
                              <span className="text-[8px] bg-transparent text-muted-foreground border border-border px-1.5 py-0.5 rounded font-medium uppercase tracking-wider flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" /> Soon
                              </span>
                            )}
                            {item.badge && !item.comingSoon && (
                              <span className="text-[8px] bg-sidebar-accent text-sidebar-foreground px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={`border-t border-sidebar-border py-3 ${isCollapsed ? 'px-0 items-center' : 'px-3'}`}>
        <Link to="/dashboard" aria-label="ERP Dashboard" title="ERP Dashboard">
          <Button
            variant="outline"
            className={`bg-transparent text-warning border-warning/30 hover:border-warning/50 hover:bg-warning/5 hover:text-warning hover:t-glow transition-all duration-200 font-semibold tracking-wide text-xs ${
              isCollapsed ? 'h-9 w-9 p-0' : 'w-full h-8'
            }`}
          >
            <Building2 className="h-4 w-4" />
            {!isCollapsed && <span className="ml-2">ERP Dashboard</span>}
          </Button>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}

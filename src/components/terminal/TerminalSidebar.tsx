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

const navItems = [
  { title: 'Dashboard', url: '/terminal', icon: LayoutDashboard },
  { title: 'Ads Manager', url: '/terminal/ads', icon: Megaphone },
  { title: 'Orders', url: '/terminal/orders', icon: ShoppingCart },
  { title: 'Automation', url: '/terminal/automation', icon: Bot, badge: 'Soon' },
  { title: 'Analytics', url: '/terminal/analytics', icon: Activity, badge: 'Soon' },
  { title: 'Settings', url: '/terminal/settings', icon: Settings, badge: 'Soon' },
];

export function TerminalSidebar() {
  const location = useLocation();

  const isActive = (url: string) => {
    if (url === '/terminal') return location.pathname === '/terminal';
    return location.pathname.startsWith(url);
  };

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-3.5 border-b border-sidebar-border">
        <Link to="/terminal" className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded bg-accent-yellow-tint border border-accent-yellow/20 flex items-center justify-center">
            <span className="text-accent-yellow font-bold text-[9px] tracking-tight">P2P</span>
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

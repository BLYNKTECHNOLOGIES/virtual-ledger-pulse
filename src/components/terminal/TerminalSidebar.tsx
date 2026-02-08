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
    <Sidebar className="border-r border-border bg-sidebar">
      <SidebarHeader className="px-4 py-4 border-b border-border">
        <Link to="/terminal" className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <span className="text-primary font-bold text-[10px] tracking-tight">P2P</span>
          </div>
          <div>
            <h1 className="text-xs font-semibold text-foreground tracking-tight">P2P Terminal</h1>
            <p className="text-[9px] text-muted-foreground leading-none mt-0.5">Trading Operations</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground px-3 mb-1 font-medium">
            Operations
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className="h-8 gap-2 text-[12px] rounded-md transition-colors"
                  >
                    <Link to={item.url}>
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">{item.title}</span>
                      {item.badge && (
                        <span className="text-[8px] bg-accent text-muted-foreground px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
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

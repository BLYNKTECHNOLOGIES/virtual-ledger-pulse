
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, TrendingDown, TrendingUp, Users, Settings as SettingsIcon, Megaphone, LogOut, Bell, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';

import AdManager from '@/pages/AdManager';
import { OPDashboard } from '@/components/order-processing/OPDashboard';
import { OPAllOrders } from '@/components/order-processing/OPAllOrders';
import { OPSmallOrders } from '@/components/order-processing/OPSmallOrders';
import { OPLargeOrders } from '@/components/order-processing/OPLargeOrders';
import { OPStaffManagement } from '@/components/order-processing/OPStaffManagement';
import { OPSettings } from '@/components/order-processing/OPSettings';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'all-orders', label: 'All Orders', icon: ShoppingCart },
  { id: 'small-orders', label: 'Small Orders', icon: TrendingDown },
  { id: 'large-orders', label: 'Large Orders', icon: TrendingUp },
  { id: 'staff', label: 'Staff Management', icon: Users },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'ad-manager', label: 'Ad Manager', icon: Megaphone },
];

export default function OrderProcessing() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { user, logout } = useAuth();

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <OPDashboard />;
      case 'all-orders': return <OPAllOrders />;
      case 'small-orders': return <OPSmallOrders />;
      case 'large-orders': return <OPLargeOrders />;
      case 'staff': return <OPStaffManagement />;
      case 'settings': return <OPSettings />;
      case 'ad-manager': return <div className="dark bg-background text-foreground rounded-xl"><AdManager darkMode /></div>;
      default: return <OPDashboard />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-[220px] min-h-screen bg-card border-r border-border flex flex-col fixed left-0 top-0 bottom-0 z-30">
        {/* Logo */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-black text-lg">
              B
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">Binance P2P</h1>
              <p className="text-[11px] text-muted-foreground">Order System</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                  ${isActive
                    ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
              >
                <item.icon className={`h-[18px] w-[18px] ${isActive ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 bg-amber-500/20 border border-amber-500/30">
              <AvatarFallback className="bg-amber-500/20 text-amber-500 dark:text-amber-400 text-xs font-bold">
                {user?.firstName?.[0] || user?.username?.[0]?.toUpperCase() || 'A'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">{user?.firstName || user?.username || 'Admin User'}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ADMIN</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-accent h-8 px-2 text-xs gap-1.5">
                <LogOut className="h-3.5 w-3.5" /> Back to ERP
              </Button>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-[220px] flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="shrink-0 z-20 bg-background/90 backdrop-blur-md border-b border-border px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Welcome back, {user?.firstName || user?.username || 'Admin'}
              </h2>
              <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-accent h-9 w-9 relative">
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
              </Button>
              <div className="flex items-center gap-2 ml-2 bg-secondary rounded-full pl-1 pr-3 py-1">
                <Avatar className="h-8 w-8 bg-amber-500/20 border border-amber-500/30">
                  <AvatarFallback className="bg-amber-500/20 text-amber-500 dark:text-amber-400 text-xs font-bold">
                    {user?.firstName?.[0] || user?.username?.[0]?.toUpperCase() || 'A'}
                  </AvatarFallback>
                </Avatar>
                <div className="text-right">
                  <p className="text-xs font-medium text-foreground">{user?.firstName || user?.username || 'Admin User'}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">ADMIN</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-8">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

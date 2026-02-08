
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Megaphone, LayoutDashboard, ShoppingCart, TrendingDown, TrendingUp, Users, Settings, Network } from 'lucide-react';
import AdManager from './AdManager';
import { OPDashboard } from '@/components/order-processing/OPDashboard';
import { OPAllOrders } from '@/components/order-processing/OPAllOrders';
import { OPSmallOrders } from '@/components/order-processing/OPSmallOrders';
import { OPLargeOrders } from '@/components/order-processing/OPLargeOrders';
import { OPStaffManagement } from '@/components/order-processing/OPStaffManagement';
import { OPSettings } from '@/components/order-processing/OPSettings';

export default function OrderProcessing() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <Network className="h-7 w-7 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Binance P2P Order Processing</h1>
            <p className="text-sm text-gray-400">Manage P2P orders, ads, staff and system settings</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-gray-900/60 border border-gray-800 p-1 h-auto flex-wrap gap-1">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-gray-400 gap-2">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="all-orders" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-gray-400 gap-2">
              <ShoppingCart className="h-4 w-4" /> All Orders
            </TabsTrigger>
            <TabsTrigger value="small-orders" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-gray-400 gap-2">
              <TrendingDown className="h-4 w-4" /> Small Orders
            </TabsTrigger>
            <TabsTrigger value="large-orders" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-gray-400 gap-2">
              <TrendingUp className="h-4 w-4" /> Large Orders
            </TabsTrigger>
            <TabsTrigger value="staff" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-gray-400 gap-2">
              <Users className="h-4 w-4" /> Staff
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-gray-400 gap-2">
              <Settings className="h-4 w-4" /> Settings
            </TabsTrigger>
            <TabsTrigger value="ad-manager" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-gray-400 gap-2">
              <Megaphone className="h-4 w-4" /> Ad Manager
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <OPDashboard />
          </TabsContent>
          <TabsContent value="all-orders" className="mt-6">
            <OPAllOrders />
          </TabsContent>
          <TabsContent value="small-orders" className="mt-6">
            <OPSmallOrders />
          </TabsContent>
          <TabsContent value="large-orders" className="mt-6">
            <OPLargeOrders />
          </TabsContent>
          <TabsContent value="staff" className="mt-6">
            <OPStaffManagement />
          </TabsContent>
          <TabsContent value="settings" className="mt-6">
            <OPSettings />
          </TabsContent>
          <TabsContent value="ad-manager" className="mt-6">
            <div className="bg-white rounded-xl">
              <AdManager />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

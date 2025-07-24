
import { Calendar, Home, Users, Building2, CreditCard, TrendingUp, UserCheck, Calculator, Scale, Package, BookOpen, ShoppingCart, Settings, UserPlus, PanelLeftClose, PanelLeftOpen, Video, Shield, BarChart3, Network, Edit3, Save, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useSidebarPreferences } from "@/hooks/useSidebarPreferences";
import { DraggableSidebarItem } from "@/components/DraggableSidebarItem";
import { useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useToast } from "@/hooks/use-toast";
import { useSidebarEdit } from "@/contexts/SidebarEditContext";

// Menu items with required permissions - adding id field for sortable
const items = [{
  id: "dashboard",
  title: "Dashboard",
  url: "/dashboard",
  icon: Home,
  color: "text-blue-600",
  bgColor: "bg-blue-100",
  permissions: ["dashboard_view"]
}, {
  id: "sales",
  title: "Sales",
  url: "/sales",
  icon: TrendingUp,
  color: "text-emerald-600",
  bgColor: "bg-emerald-100",
  permissions: ["sales_view", "sales_manage"]
}, {
  id: "purchase",
  title: "Purchase",
  url: "/purchase",
  icon: ShoppingCart,
  color: "text-purple-600",
  bgColor: "bg-purple-100",
  permissions: ["purchase_view", "purchase_manage"]
}, {
  id: "bams",
  title: "BAMS",
  url: "/bams",
  icon: Building2,
  color: "text-orange-600",
  bgColor: "bg-orange-100",
  permissions: ["bams_view", "bams_manage"]
}, {
  id: "clients",
  title: "Clients",
  url: "/clients",
  icon: Users,
  color: "text-cyan-600",
  bgColor: "bg-cyan-100",
  permissions: ["clients_view", "clients_manage"]
}, {
  id: "leads",
  title: "Leads",
  url: "/leads",
  icon: UserPlus,
  color: "text-teal-600",
  bgColor: "bg-teal-100",
  permissions: ["leads_view", "leads_manage"]
}, {
  id: "management",
  title: "Management",
  url: "/management",
  icon: Network,
  color: "text-slate-600",
  bgColor: "bg-slate-100",
  permissions: ["hrms_view", "hrms_manage", "user_management_view"]
}, {
  id: "user-management",
  title: "User Management",
  url: "/user-management",
  icon: Settings,
  color: "text-indigo-600",
  bgColor: "bg-indigo-100",
  permissions: ["user_management_view", "user_management_manage"]
}, {
  id: "hrms",
  title: "HRMS",
  url: "/hrms",
  icon: UserCheck,
  color: "text-pink-600",
  bgColor: "bg-pink-100",
  permissions: ["hrms_view", "hrms_manage"]
}, {
  id: "payroll",
  title: "Payroll",
  url: "/payroll",
  icon: Calculator,
  color: "text-blue-700",
  bgColor: "bg-blue-100",
  permissions: ["payroll_view", "payroll_manage"]
}, {
  id: "compliance",
  title: "Compliance",
  url: "/compliance",
  icon: Scale,
  color: "text-red-600",
  bgColor: "bg-red-100",
  permissions: ["compliance_view", "compliance_manage"]
}, {
  id: "stock",
  title: "Stock Management",
  url: "/stock",
  icon: Package,
  color: "text-amber-600",
  bgColor: "bg-amber-100",
  permissions: ["stock_view", "stock_manage"]
}, {
  id: "accounting",
  title: "Accounting",
  url: "/accounting",
  icon: BookOpen,
  color: "text-yellow-700",
  bgColor: "bg-yellow-100",
  permissions: ["accounting_view", "accounting_manage"]
}, {
  id: "video-kyc",
  title: "Video KYC",
  url: "/video-kyc",
  icon: Video,
  color: "text-violet-600",
  bgColor: "bg-violet-100",
  permissions: ["video_kyc_view", "video_kyc_manage"]
}, {
  id: "kyc-approvals",
  title: "KYC Approvals",
  url: "/kyc-approvals",
  icon: Shield,
  color: "text-blue-600",
  bgColor: "bg-blue-100",
  permissions: ["kyc_approvals_view", "kyc_approvals_manage"]
}, {
  id: "profit-loss",
  title: "P&L",
  url: "/profit-loss",
  icon: TrendingUp,
  color: "text-teal-600",
  bgColor: "bg-teal-100",
  permissions: ["accounting_view", "accounting_manage"]
}, {
  id: "financials",
  title: "Financials",
  url: "/financials",
  icon: Calculator,
  color: "text-emerald-600",
  bgColor: "bg-emerald-100",
  permissions: ["accounting_view", "accounting_manage"]
}, {
  id: "ems",
  title: "EMS",
  url: "/ems",
  icon: UserCheck,
  color: "text-indigo-600",
  bgColor: "bg-indigo-100",
  permissions: ["hrms_view", "hrms_manage"]
}, {
  id: "statistics",
  title: "Statistics",
  url: "/statistics",
  icon: BarChart3,
  color: "text-green-600",
  bgColor: "bg-green-100",
  permissions: ["statistics_view", "statistics_manage"]
}];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const { hasAnyPermission, isLoading } = usePermissions();
  const { applySidebarOrder, saveSidebarOrder, isSaving } = useSidebarPreferences();
  const { toast } = useToast();
  const { isDragMode } = useSidebarEdit();
  const isCollapsed = state === "collapsed";
  const [localItems, setLocalItems] = useState(items);

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter items based on user permissions and apply saved order
  const filteredItems = localItems.filter(item => !isLoading && hasAnyPermission(item.permissions));
  const visibleItems = applySidebarOrder(filteredItems);
  
  console.log('AppSidebar: Items processing', {
    localItemsCount: localItems.length,
    filteredItemsCount: filteredItems.length,
    visibleItemsCount: visibleItems.length,
    isDragMode
  });

  const handleDragEnd = (event: DragEndEvent) => {
    console.log('AppSidebar: handleDragEnd called', event);
    
    const { active, over } = event;

    if (!active || !over) {
      console.log('AppSidebar: No active or over element');
      return;
    }

    if (active.id !== over.id) {
      console.log('AppSidebar: Items reordered', { activeId: active.id, overId: over.id });
      
      try {
        const oldIndex = visibleItems.findIndex(item => item.id === active.id);
        const newIndex = visibleItems.findIndex(item => item.id === over.id);
        
        console.log('AppSidebar: Indices found', { oldIndex, newIndex });
        
        if (oldIndex === -1 || newIndex === -1) {
          console.error('AppSidebar: Could not find item indices');
          return;
        }
        
        try {
          const newOrder = arrayMove(visibleItems, oldIndex, newIndex);
          console.log('AppSidebar: New order created', newOrder.map(item => item.title));
          
          // Update local state immediately for smooth UI
          setLocalItems(prevItems => {
            const visibleIds = new Set(visibleItems.map(item => item.id));
            const nonVisibleItems = prevItems.filter(item => !visibleIds.has(item.id));
            const result = [...newOrder, ...nonVisibleItems];
            console.log('AppSidebar: Updated local items', result.map(item => item.title));
            return result;
          });
          
          // Save to database (this will also invalidate cache)
          console.log('AppSidebar: Calling saveSidebarOrder');
          saveSidebarOrder(newOrder);
        } catch (error) {
          console.error('AppSidebar: Error in handleDragEnd', error);
          toast({
            title: "Error",
            description: "Failed to reorder sidebar items. Please try again.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('AppSidebar: Error in handleDragEnd', error);
        toast({
          title: "Error",
          description: "Failed to reorder sidebar items. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      console.log('AppSidebar: No reorder needed - same position');
    }
  };

  if (isLoading) {
    return (
      <Sidebar className="border-r-2 border-gray-200 bg-white shadow-lg">
        <SidebarHeader className="p-4 border-b-2 border-gray-100 bg-blue-600">
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 bg-white/20 rounded-lg animate-pulse"></div>
          </div>
        </SidebarHeader>
        
        <SidebarContent className="bg-white">
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="flex justify-center items-center h-20">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        
        <SidebarFooter className="p-4 border-t-2 border-gray-100 bg-gray-50">
          <Button variant="ghost" size="sm" onClick={toggleSidebar} className="text-gray-600 hover:bg-white hover:text-gray-800 ml-auto rounded-lg">
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar className="border-r-2 border-gray-200 bg-white shadow-lg" collapsible="icon">
      <SidebarHeader className="p-4 border-b-2 border-gray-100 bg-blue-600">
        <div className="flex items-center justify-center min-h-[60px]">
          <img 
            src="/lovable-uploads/421c0134-ad3f-4de9-889f-972a88a59561.png" 
            alt="Blynk Virtual Technologies Logo" 
            className="h-12 w-auto flex-shrink-0 bg-white/10 p-2 rounded-lg shadow-lg"
          />
          {!isCollapsed && (
            <div className="flex flex-col min-w-0 ml-3">
              <h2 className="text-sm font-bold text-white tracking-tight leading-tight truncate">BLYNK VIRTUAL</h2>
              <p className="text-sm text-blue-100 font-bold -mt-0.5 truncate">TECHNOLOGIES</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      
      <SidebarContent className="bg-white">
        <SidebarGroup>
          <SidebarGroupContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleItems.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <SidebarMenu className="space-y-2 px-2">
                  {visibleItems.map(item => (
                    <DraggableSidebarItem
                      key={item.id}
                      item={item}
                      isCollapsed={isCollapsed}
                      isDragMode={isDragMode}
                    />
                  ))}
                </SidebarMenu>
              </SortableContext>
            </DndContext>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {visibleItems.length === 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="text-center py-8 text-gray-500">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Shield className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium">No accessible modules</p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      
      <SidebarFooter className="p-3 border-t-2 border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="text-xs text-gray-500 font-medium truncate flex-1 mr-2 bg-white px-2 py-1 rounded-lg shadow-sm">
              © 2025 BLYNK Virtual Technologies
            </div>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={toggleSidebar} 
            className="text-gray-600 hover:bg-white hover:text-gray-800 rounded-lg flex-shrink-0 border-2 border-transparent hover:border-gray-200 transition-all duration-200"
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

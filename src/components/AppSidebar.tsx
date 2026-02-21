
import { Calendar, Home, Users, Building2, CreditCard, TrendingUp, UserCheck, Calculator, Scale, Package, BookOpen, ShoppingCart, Settings, UserPlus, PanelLeftClose, PanelLeftOpen, Video, Shield, BarChart3, Network, Edit3, Save, X, Megaphone, FileText, Wrench } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useSidebarPreferences } from "@/hooks/useSidebarPreferences";
import { DraggableSidebarItem } from "@/components/DraggableSidebarItem";
import { CollapsibleSidebarGroup, SidebarGroupConfig, SidebarGroupItem } from "@/components/sidebar/CollapsibleSidebarGroup";
import { useState, useMemo, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useToast } from "@/hooks/use-toast";
import { useSidebarEdit } from "@/contexts/SidebarEditContext";

// Standalone menu items (not in groups)
const standaloneItems: SidebarGroupItem[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    permissions: ["dashboard_view"]
  },
  {
    id: "stock",
    title: "Stock Management",
    url: "/stock",
    icon: Package,
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    permissions: ["stock_view", "stock_manage"]
  },
  {
    id: "sales",
    title: "Sales",
    url: "/sales",
    icon: TrendingUp,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    permissions: ["sales_view", "sales_manage"]
  },
  {
    id: "purchase",
    title: "Purchase",
    url: "/purchase",
    icon: ShoppingCart,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    permissions: ["purchase_view", "purchase_manage"]
  },
  {
    id: "bams",
    title: "BAMS",
    url: "/bams",
    icon: Building2,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    permissions: ["bams_view", "bams_manage"]
  },
  {
    id: "clients",
    title: "Clients",
    url: "/clients",
    icon: Users,
    color: "text-cyan-600",
    bgColor: "bg-cyan-100",
    permissions: ["clients_view", "clients_manage"]
  },
  {
    id: "leads",
    title: "Leads",
    url: "/leads",
    icon: UserPlus,
    color: "text-teal-600",
    bgColor: "bg-teal-100",
    permissions: ["leads_view", "leads_manage"]
  },
  {
    id: "user-management",
    title: "User Management",
    url: "/user-management",
    icon: Settings,
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
    permissions: ["user_management_view", "user_management_manage"]
  },
  {
    id: "compliance",
    title: "Compliance",
    url: "/compliance",
    icon: Scale,
    color: "text-red-600",
    bgColor: "bg-red-100",
    permissions: ["compliance_view", "compliance_manage"]
  },
  {
    id: "risk-management",
    title: "Risk Management",
    url: "/risk-management",
    icon: Shield,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    permissions: ["risk_management_view", "risk_management_manage"]
  },
  {
    id: "video-kyc",
    title: "Video KYC",
    url: "/video-kyc",
    icon: Video,
    color: "text-violet-600",
    bgColor: "bg-violet-100",
    permissions: ["video_kyc_view", "video_kyc_manage"]
  },
  {
    id: "kyc-approvals",
    title: "KYC Approvals",
    url: "/kyc-approvals",
    icon: Shield,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    permissions: ["kyc_approvals_view", "kyc_approvals_manage"]
  },
  {
    id: "hrms",
    title: "HRMS",
    url: "/hrms",
    icon: UserCheck,
    color: "text-pink-600",
    bgColor: "bg-pink-100",
    permissions: ["hrms_view", "hrms_manage"]
  }
];

// Grouped items (PIN protection removed - now using role-based access)
const sidebarGroups: SidebarGroupConfig[] = [
  {
    id: "finance-analytics",
    title: "Finance & Analytics",
    icon: BarChart3,
    color: "text-green-600",
    bgColor: "bg-green-100",
    children: [
      {
        id: "accounting",
        title: "Accounting",
        url: "/accounting",
        icon: BookOpen,
        color: "text-yellow-700",
        bgColor: "bg-yellow-100",
        permissions: ["accounting_view", "accounting_manage"]
      },
      {
        id: "profit-loss",
        title: "P&L",
        url: "/profit-loss",
        icon: TrendingUp,
        color: "text-teal-600",
        bgColor: "bg-teal-100",
        permissions: ["accounting_view", "accounting_manage"]
      },
      {
        id: "financials",
        title: "Financials",
        url: "/financials",
        icon: Calculator,
        color: "text-emerald-600",
        bgColor: "bg-emerald-100",
        permissions: ["accounting_view", "accounting_manage"]
      },
      {
        id: "statistics",
        title: "Statistics",
        url: "/statistics",
        icon: BarChart3,
        color: "text-green-600",
        bgColor: "bg-green-100",
        permissions: ["statistics_view", "statistics_manage"]
      }
     ]
  },
  {
    id: "utility",
    title: "Utility",
    icon: Wrench,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    children: [
      {
        id: "utility-hub",
        title: "All Tools",
        url: "/utility",
        icon: Wrench,
        color: "text-gray-600",
        bgColor: "bg-gray-100",
        permissions: ["dashboard_view"]
      }
    ]
  }
];

// Combined type for sidebar items
type SidebarEntry = 
  | { type: 'item'; data: SidebarGroupItem }
  | { type: 'group'; data: SidebarGroupConfig };

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const { hasAnyPermission, isLoading } = usePermissions();
  const { applySidebarOrder, saveSidebarOrder, isSaving } = useSidebarPreferences();
  const { toast } = useToast();
  const { isDragMode } = useSidebarEdit();
  const isCollapsed = state === "collapsed";

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

  // Build sidebar entries with permissions filtering
  const sidebarEntries = useMemo(() => {
    const entries: SidebarEntry[] = [];
    
    // Add standalone items that user has permission for
    standaloneItems.forEach(item => {
      if (!isLoading && hasAnyPermission(item.permissions)) {
        entries.push({ type: 'item', data: item });
      }
    });
    
    // Add groups (filter children by permissions)
    sidebarGroups.forEach(group => {
      const filteredChildren = group.children.filter(
        child => !isLoading && hasAnyPermission(child.permissions)
      );
      if (filteredChildren.length > 0) {
        entries.push({
          type: 'group',
          data: { ...group, children: filteredChildren }
        });
      }
    });
    
    return entries;
  }, [isLoading, hasAnyPermission]);

  // Apply saved order to entries
  const savedOrderedEntries = useMemo(() => {
    return applySidebarOrder(sidebarEntries);
  }, [sidebarEntries, applySidebarOrder]);

  // Local state for immediate drag feedback
  const [orderedEntries, setOrderedEntries] = useState(savedOrderedEntries);

  // Sync local state when saved order changes (e.g. after DB fetch)
  useEffect(() => {
    setOrderedEntries(savedOrderedEntries);
  }, [savedOrderedEntries]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!active || !over || active.id === over.id) {
      return;
    }

    try {
      const oldIndex = orderedEntries.findIndex(
        entry => entry.data.id === active.id
      );
      const newIndex = orderedEntries.findIndex(
        entry => entry.data.id === over.id
      );
      
      if (oldIndex === -1 || newIndex === -1) {
        return;
      }
      
      const newOrder = arrayMove(orderedEntries, oldIndex, newIndex);
      setOrderedEntries(newOrder); // Immediate local update
      saveSidebarOrder(newOrder);  // Persist in background
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reorder sidebar items. Please try again.",
        variant: "destructive",
      });
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

  const sortableIds = orderedEntries.map(entry => 
    entry.type === 'item' ? entry.data.id : entry.data.id
  );

  return (
    <Sidebar className="border-r-2 border-gray-200 bg-white shadow-lg" collapsible="icon">
      <SidebarHeader className={`border-b-2 border-gray-100 bg-blue-600 ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <div className={`flex items-center justify-center min-h-[60px] ${isCollapsed ? 'min-h-[56px]' : 'min-h-[60px]'}`}>
          <img 
            src="/lovable-uploads/421c0134-ad3f-4de9-889f-972a88a59561.png" 
            alt="BLYNK Virtual Technologies Logo" 
            className={`w-auto flex-shrink-0 bg-white/10 p-2 rounded-lg shadow-lg ${isCollapsed ? 'h-8 w-8' : 'h-12'}`}
          />
          {!isCollapsed && (
            <div className="flex flex-col min-w-0 ml-3">
              <h2 className="text-sm font-bold text-white tracking-tight leading-tight truncate">BLYNK VIRTUAL</h2>
              <p className="text-sm text-blue-100 font-bold -mt-0.5 truncate">TECHNOLOGIES</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      
      <SidebarContent className="bg-white overflow-y-auto max-h-screen">
        <SidebarGroup>
          <SidebarGroupContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                <SidebarMenu className={`space-y-1 ${isCollapsed ? 'px-1' : 'px-2'}`}>
                  {orderedEntries.map(entry => {
                    if (entry.type === 'group') {
                      return (
                        <CollapsibleSidebarGroup
                          key={entry.data.id}
                          group={entry.data}
                          isCollapsed={isCollapsed}
                          isDragMode={isDragMode}
                        />
                      );
                    }
                    
                    return (
                      <DraggableSidebarItem
                        key={entry.data.id}
                        item={entry.data}
                        isCollapsed={isCollapsed}
                        isDragMode={isDragMode}
                      />
                    );
                  })}
                </SidebarMenu>
              </SortableContext>
            </DndContext>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {orderedEntries.length === 0 && (
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
      
      <SidebarFooter className={`border-t-2 border-gray-100 bg-gray-50 ${isCollapsed ? 'p-1' : 'p-2'}`}>
        <div className="flex flex-col gap-2">
          <Link to="/terminal">
            <Button
              variant="ghost"
              className={`w-full bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-amber-400 hover:from-gray-800 hover:via-gray-700 hover:to-gray-800 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 shadow-lg hover:shadow-amber-500/10 transition-all duration-300 font-semibold tracking-wide ${isCollapsed ? 'h-8 w-8 p-0' : 'h-9'}`}
            >
              <Megaphone className={`h-4 w-4 ${isCollapsed ? '' : 'mr-2'}`} />
              {!isCollapsed && <span className="text-xs">Terminal</span>}
            </Button>
          </Link>
          <div className="flex items-center justify-center">
            {!isCollapsed && (
              <div className="text-xs text-gray-500 font-medium truncate flex-1 mr-2 bg-white px-2 py-1 rounded-lg shadow-sm">
                © 2025 BLYNK Virtual Technologies
              </div>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleSidebar} 
              className={`text-gray-600 hover:bg-white hover:text-gray-800 rounded-lg flex-shrink-0 border-2 border-transparent hover:border-gray-200 transition-all duration-200 ${isCollapsed ? 'h-8 w-8 p-0' : ''}`}
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}


import { Calendar, Home, Users, Building2, CreditCard, TrendingUp, UserCheck, Calculator, Scale, Package, BookOpen, ShoppingCart, Settings, UserPlus, PanelLeftClose, PanelLeftOpen, Shield, ShieldCheck, BarChart3, Network, Edit3, Save, X, Megaphone, FileText, Wrench, CheckSquare, Inbox, Sparkles, Headset, Keyboard, Mail } from "lucide-react";
import blynkLogoWhite from "@/assets/brand/blynk-logo-white.svg";
import blynkIcon from "@/assets/brand/blynk-icon.svg";
import { Link, useLocation } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { useSidebarPreferences } from "@/hooks/useSidebarPreferences";
import { DraggableSidebarItem } from "@/components/DraggableSidebarItem";
import { CollapsibleSidebarGroup, SidebarGroupConfig, SidebarGroupItem } from "@/components/sidebar/CollapsibleSidebarGroup";
import { useState, useMemo, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useToast } from "@/hooks/use-toast";
import { useSidebarEdit } from "@/contexts/SidebarEditContext";
import { useErpReconciliationAccess } from "@/hooks/useErpReconciliationAccess";
import { useAuth } from "@/hooks/useAuth";

// Reconciliation cockpit item (gated by reconciliation function, not a permission string)
const reconciliationItem: SidebarGroupItem = {
  id: "reconciliation",
  title: "Reconciliation",
  url: "/reconciliation",
  icon: ShieldCheck,
  color: "text-destructive",
  bgColor: "bg-destructive/10",
  permissions: [],
};

const reportSettingsItem: SidebarGroupItem = {
  id: "report-formats",
  title: "Report Formats",
  url: "/settings/report-formats",
  icon: Mail,
  color: "text-primary",
  bgColor: "bg-primary/10",
  permissions: [],
};

// Standalone menu items (not in groups)
const standaloneItems: SidebarGroupItem[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
    color: "text-primary",
    bgColor: "bg-primary/10",
    permissions: ["dashboard_view"]
  },
  {
    id: "erp-entry",
    title: "ERP Entry",
    url: "/erp-entry",
    icon: Inbox,
    color: "text-info",
    bgColor: "bg-info/10",
    permissions: ["erp_entry_view", "erp_entry_manage"]
  },
  {
    id: "stock",
    title: "Stock Management",
    url: "/stock",
    icon: Package,
    color: "text-warning",
    bgColor: "bg-warning/10",
    permissions: ["stock_view", "stock_manage"]
  },
  {
    id: "sales",
    title: "Sales",
    url: "/sales",
    icon: TrendingUp,
    color: "text-success",
    bgColor: "bg-success/10",
    permissions: ["sales_view", "sales_manage"]
  },
  {
    id: "purchase",
    title: "Purchase",
    url: "/purchase",
    icon: ShoppingCart,
    color: "text-primary",
    bgColor: "bg-primary/10",
    permissions: ["purchase_view", "purchase_manage"]
  },
  {
    id: "bams",
    title: "BAMS",
    url: "/bams",
    icon: Building2,
    color: "text-warning",
    bgColor: "bg-warning/10",
    permissions: ["bams_view", "bams_manage"]
  },
  {
    id: "clients",
    title: "Clients",
    url: "/clients",
    icon: Users,
    color: "text-info",
    bgColor: "bg-info/10",
    permissions: ["clients_view", "clients_manage"]
  },
  {
    id: "ra-dashboard",
    title: "RA Dashboard",
    url: "/ra-dashboard",
    icon: Headset,
    color: "text-primary",
    bgColor: "bg-primary/10",
    permissions: ["ra_dashboard_view"]
  },
  {
    id: "leads",
    title: "Leads",
    url: "/leads",
    icon: UserPlus,
    color: "text-success",
    bgColor: "bg-success/10",
    permissions: ["leads_view", "leads_manage"]
  },
  {
    id: "user-management",
    title: "User Management",
    url: "/user-management",
    icon: Settings,
    color: "text-primary",
    bgColor: "bg-primary/10",
    permissions: ["user_management_view", "user_management_manage"]
  },
  {
    id: "compliance",
    title: "Compliance",
    url: "/compliance",
    icon: Scale,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    permissions: ["compliance_view", "compliance_manage"]
  },
  {
    id: "risk-management",
    title: "Risk Management",
    url: "/risk-management",
    icon: Shield,
    color: "text-warning",
    bgColor: "bg-warning/10",
    permissions: ["risk_management_view", "risk_management_manage"]
  },
  {
    id: "hrms",
    title: "HRMS",
    url: "/hrms",
    icon: UserCheck,
    color: "text-primary",
    bgColor: "bg-primary/10",
    permissions: ["hrms_view", "hrms_manage"]
  },
  {
    id: "tasks",
    title: "Tasks",
    url: "/tasks",
    icon: CheckSquare,
    color: "text-primary",
    bgColor: "bg-primary/10",
    permissions: ["tasks_view", "tasks_manage"]
  },
  {
    id: "help-assistant",
    title: "AI Help",
    url: "/help-assistant",
    icon: Sparkles,
    color: "text-primary",
    bgColor: "bg-primary/10",
    permissions: ["help_assistant_view", "help_assistant_manage"]
  },
  {
    id: "shortcuts",
    title: "Shortcuts",
    url: "/shortcuts",
    icon: Keyboard,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    permissions: [] // visible to all users
  }
];

// Grouped items (PIN protection removed - now using role-based access)
const sidebarGroups: SidebarGroupConfig[] = [
  {
    id: "finance-analytics",
    title: "Finance & Analytics",
    icon: BarChart3,
    color: "text-success",
    bgColor: "bg-success/10",
    children: [
      {
        id: "accounting",
        title: "Tax Management",
        url: "/accounting",
        icon: BookOpen,
        color: "text-warning",
        bgColor: "bg-warning/10",
        permissions: ["accounting_view", "accounting_manage"]
      },
      {
        id: "profit-loss",
        title: "P&L",
        url: "/profit-loss",
        icon: TrendingUp,
        color: "text-success",
        bgColor: "bg-success/10",
        permissions: ["accounting_view", "accounting_manage"]
      },
      {
        id: "financials",
        title: "Financials",
        url: "/financials",
        icon: Calculator,
        color: "text-success",
        bgColor: "bg-success/10",
        permissions: ["accounting_view", "accounting_manage"]
      },
      {
        id: "statistics",
        title: "Statistics",
        url: "/statistics",
        icon: BarChart3,
        color: "text-success",
        bgColor: "bg-success/10",
        permissions: ["statistics_view", "statistics_manage"]
      }
     ]
  },
  {
    id: "utility",
    title: "Utility",
    icon: Wrench,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    children: [
      {
        id: "utility-hub",
        title: "All Tools",
        url: "/utility",
        icon: Wrench,
        color: "text-muted-foreground",
        bgColor: "bg-muted",
        permissions: ["utility_view"]
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
  const { hasAccess: hasReconAccess } = useErpReconciliationAccess();
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("super admin");
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
      if (!isLoading && (item.permissions.length === 0 || hasAnyPermission(item.permissions))) {
        entries.push({ type: 'item', data: item });
      }
    });

    // Reconciliation cockpit — gated by the reconciliation function/role
    if (!isLoading && hasReconAccess) {
      entries.push({ type: 'item', data: reconciliationItem });
    }

    
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
  }, [isLoading, hasAnyPermission, hasReconAccess]);

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
      <Sidebar className="border-r border-sidebar-border bg-sidebar shadow-sm">
        <SidebarHeader className="relative p-4 border-b border-sidebar-border bg-primary overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary-foreground/40 to-transparent"
          />
          <div className="flex items-center justify-center min-h-[60px]">
            <Skeleton className="h-8 w-8 rounded-lg bg-primary-foreground/20" />
          </div>
        </SidebarHeader>

        <SidebarContent className="bg-sidebar">
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="space-y-2 px-2 py-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2">
                    <Skeleton className="h-6 w-6 rounded-md" />
                    <Skeleton className="h-4 flex-1 rounded" />
                  </div>
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 border-t border-sidebar-border bg-sidebar-accent">
          <Button variant="ghost" size="sm" onClick={toggleSidebar} className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ml-auto rounded-lg">
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
    <Sidebar className="border-r border-sidebar-border bg-sidebar shadow-sm" collapsible="icon">
      <SidebarHeader className={`relative overflow-hidden border-b border-sidebar-border bg-primary ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary-foreground/40 to-transparent"
        />
        <div className={`flex items-center justify-center min-h-[60px] ${isCollapsed ? 'min-h-[56px]' : 'min-h-[60px]'}`}>
          {isCollapsed ? (
            <img
              src={blynkIcon}
              alt="BLYNK Virtual Technologies"
              className="h-8 w-8 flex-shrink-0"
            />
          ) : (
            <img
              src={blynkLogoWhite}
              alt="BLYNK Virtual Technologies"
              className="h-10 w-auto flex-shrink-0"
            />
          )}
        </div>
      </SidebarHeader>
      
      <SidebarContent className="bg-sidebar overflow-y-auto max-h-screen">
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
              <div className="text-center py-8 text-muted-foreground">
                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Shield className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No accessible modules</p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      
      <SidebarFooter className={`border-t border-sidebar-border bg-sidebar-accent ${isCollapsed ? 'p-1' : 'p-2'}`}>
        <div className="flex flex-col gap-2">
          <Link to="/terminal">
            <Button
              variant="ghost"
              className={`w-full bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning border border-warning/30 hover:border-warning/50 shadow-sm transition-all duration-300 font-semibold tracking-wide ${isCollapsed ? 'h-8 w-8 p-0' : 'h-9'}`}
            >
              <Megaphone className={`h-4 w-4 ${isCollapsed ? '' : 'mr-2'}`} />
              {!isCollapsed && <span className="text-xs">Terminal</span>}
            </Button>
          </Link>
          <div className="flex items-center justify-center">
            {!isCollapsed && (
              <div className="text-xs text-muted-foreground font-medium truncate flex-1 mr-2 bg-sidebar px-2 py-1 rounded-lg shadow-sm">
                © {new Date().getFullYear()} BLYNK Virtual Technologies
              </div>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleSidebar} 
              className={`text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg flex-shrink-0 border border-transparent hover:border-sidebar-border transition-all duration-200 ${isCollapsed ? 'h-8 w-8 p-0' : ''}`}
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

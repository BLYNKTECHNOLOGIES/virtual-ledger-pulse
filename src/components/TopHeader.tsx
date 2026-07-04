import { Settings, RotateCcw, Globe, Edit3, X, Search, GripVertical, LayoutDashboard, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { UserMenu } from "@/components/UserMenu";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebarEdit } from "@/contexts/SidebarEditContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { useShortcuts } from "@/contexts/ShortcutsProvider";


export function TopHeader() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { isDragMode, setIsDragMode, isDashboardRearrangeMode, setIsDashboardRearrangeMode } = useSidebarEdit();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { focusPageSearch, openPalette } = useShortcuts();

  const handlePageSearch = () => {
    if (!focusPageSearch()) {
      toast({
        title: "No search on this page",
        description: "This page doesn't have a search box.",
      });
    }
  };

  const handleViewWebsite = () => {
    navigate('/website/vasp-home');
  };

  const handleReload = () => {
    queryClient.invalidateQueries();
    toast({ title: "Refreshed", description: "All data has been refreshed." });
  };

  const handleDashboardClick = () => {
    navigate('/dashboard');
  };

  const toggleSidebarEdit = () => {
    if (isDragMode) {
      toast({
        title: "Edit Mode Disabled",
        description: "Sidebar order has been saved. You can now navigate normally.",
      });
    } else {
      toast({
        title: "Edit Mode Enabled", 
        description: "Drag sidebar items to reorder them. Use settings menu to exit edit mode.",
      });
    }
    setIsDragMode(!isDragMode);
  };

  const toggleDashboardRearrange = () => {
    if (isDashboardRearrangeMode) {
      toast({
        title: "Rearrange Mode Disabled",
        description: "Dashboard widget order has been saved.",
      });
    } else {
      if (location.pathname !== '/dashboard') {
        navigate('/dashboard');
      }
      toast({
        title: "Rearrange Mode Enabled",
        description: "Drag dashboard widgets to reorder them.",
      });
    }
    setIsDashboardRearrangeMode(!isDashboardRearrangeMode);
  };


  return (
    <header className="h-14 md:h-16 bg-card border-b-2 border-border flex items-center justify-between px-3 md:px-6 shadow-sm">
      <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
        <SidebarTrigger
          className="hidden md:inline-flex h-9 w-9 flex-shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary border border-border rounded-lg"
          aria-label="Toggle sidebar"
          title="Collapse / expand sidebar (Ctrl/⌘ + B)"
        />
        <button 
          onClick={handleDashboardClick}
          className="text-sm md:text-lg font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer truncate"
        >
          <span className="hidden sm:inline">BLYNK VIRTUAL TECHNOLOGIES PVT. LTD.</span>
          <span className="sm:hidden">BLYNK VT</span>
        </button>
        
        {isDragMode && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-lg">
            <Edit3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Sidebar Edit Mode Active</span>
          </div>
        )}
        {isDashboardRearrangeMode && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-lg">
            <GripVertical className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Dashboard Rearrange Active</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2 md:gap-4">
        {/* Search this page — focuses the current page's search box ("/") */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePageSearch}
          className="p-2 border rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary border-border"
          aria-label="Search this page"
          title="Search this page ( / )"
        >
          <Search className="h-5 w-5" />
        </Button>

        {/* Command palette omnibox - hidden on mobile, visible on tablet+ */}
        <button
          type="button"
          onClick={openPalette}
          className="relative hidden lg:flex items-center"
        >
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <span
            className="w-64 xl:w-96 pl-10 pr-4 py-2 border border-border rounded-lg bg-muted text-sm text-muted-foreground text-left focus:outline-none"
          >
            Search or type a command (⌘ + K)
          </span>
        </button>

        
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/settings/exchange-accounts')}
              className="p-2 border rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary border-border"
              aria-label="Binance Accounts"
              title="Binance Accounts"
            >
              <Layers className="h-5 w-5" />
            </Button>
          )}
          <NotificationDropdown />

          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className={`p-2 border rounded-lg transition-colors ${
                  isDragMode 
                    ? 'text-primary bg-primary/10 border-primary/20 hover:bg-primary/20' 
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary border-border'
                }`}
              >
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={toggleSidebarEdit} className="cursor-pointer">
                {isDragMode ? (
                  <>
                    <X className="mr-2 h-4 w-4" />
                    Exit Sidebar Edit Mode
                  </>
                ) : (
                  <>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit Sidebar
                  </>
                )}
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={toggleDashboardRearrange} className="cursor-pointer">
                {isDashboardRearrangeMode ? (
                  <>
                    <X className="mr-2 h-4 w-4" />
                    Exit Dashboard Rearrange
                  </>
                ) : (
                  <>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Rearrange Dashboard
                  </>
                )}
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={handleViewWebsite} className="cursor-pointer">
                <Globe className="mr-2 h-4 w-4" />
                View Website
              </DropdownMenuItem>

              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate('/settings/exchange-accounts')} className="cursor-pointer">
                  <Layers className="mr-2 h-4 w-4" />
                  Binance Accounts
                </DropdownMenuItem>
              )}

              
              <DropdownMenuItem onClick={handleReload} className="cursor-pointer">
                <RotateCcw className="mr-2 h-4 w-4" />
                Reload Page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
import { Settings, RotateCcw, Globe, Edit3, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
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
import { useToast } from "@/hooks/use-toast";
import { NotificationDropdown } from "@/components/NotificationDropdown";

export function TopHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isDragMode, setIsDragMode } = useSidebarEdit();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const handleViewWebsite = () => {
    navigate('/website/vasp-home');
  };

  const handleReload = () => {
    window.location.reload();
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      toast({
        title: "Search",
        description: `Searching for: ${searchQuery}`,
      });
      // Here you can implement actual search functionality
      // For now, just showing a toast
    }
  };

  return (
    <header className="h-14 md:h-16 bg-white border-b-2 border-blue-100 flex items-center justify-between px-3 md:px-6 shadow-sm">
      <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
        <button 
          onClick={handleDashboardClick}
          className="text-sm md:text-lg font-bold text-blue-700 hover:text-blue-800 transition-colors cursor-pointer truncate"
        >
          <span className="hidden sm:inline">BLYNK VIRTUAL TECHNOLOGIES PVT. LTD.</span>
          <span className="sm:hidden">BLYNK VT</span>
        </button>
        
        {isDragMode && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <Edit3 className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">Sidebar Edit Mode Active</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2 md:gap-4">
        {/* Search - hidden on mobile, visible on tablet+ */}
        <form onSubmit={handleSearch} className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search or type a command (⌘ + K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 xl:w-96 pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
          />
        </form>
        
        <div className="flex items-center gap-2">
          <NotificationDropdown />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className={`p-2 border-2 rounded-lg transition-colors ${
                  isDragMode 
                    ? 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100' 
                    : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 border-gray-200'
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
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={handleViewWebsite} className="cursor-pointer">
                <Globe className="mr-2 h-4 w-4" />
                View Website
              </DropdownMenuItem>
              
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
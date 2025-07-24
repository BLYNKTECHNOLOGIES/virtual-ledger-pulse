import { Bell, Settings, RotateCcw, Grid3X3, Globe, Edit3, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { UserMenu } from "@/components/UserMenu";
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

export function TopHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isDragMode, setIsDragMode } = useSidebarEdit();
  const { toast } = useToast();

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

  return (
    <header className="h-16 bg-white border-b-2 border-blue-100 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <button 
          onClick={handleDashboardClick}
          className="text-2xl font-bold text-blue-700 hover:text-blue-800 transition-colors cursor-pointer"
        >
          Dashboard
        </button>
        
        {isDragMode && (
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <Edit3 className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">Sidebar Edit Mode Active</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search or type a command (⌘ + K)"
            className="w-96 px-4 py-2 border-2 border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="p-2 text-gray-600 hover:bg-blue-50 hover:text-blue-700 border-2 border-gray-200 rounded-lg">
            <Bell className="h-5 w-5" />
          </Button>
          
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
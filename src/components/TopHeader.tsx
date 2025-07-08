
import { Bell, Settings, RotateCcw, Grid3X3, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { UserMenu } from "@/components/UserMenu";

export function TopHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleViewWebsite = () => {
    navigate('/website/vasp-home');
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleDashboardClick = () => {
    navigate('/dashboard');
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
          <Button variant="ghost" size="sm" className="p-2 text-gray-600 hover:bg-blue-50 hover:text-blue-700 border-2 border-gray-200 rounded-lg">
            <Settings className="h-5 w-5" />
          </Button>
          
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

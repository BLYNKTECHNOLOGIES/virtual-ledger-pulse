
import { Bell, Settings, User, RotateCcw, Grid3X3, Globe, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

export function TopHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const getInitials = (firstName?: string, lastName?: string, email?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const handleLogout = async () => {
    await logout();
    navigate('/website/vasp-home');
  };

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
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full ml-4 border-2 border-blue-200 hover:border-blue-400">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-600 text-white text-xs font-bold">
                    {user ? getInitials(user.firstName, user.lastName, user.email) : 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-white border-2 border-gray-200 shadow-lg" align="end" forceMount>
              <DropdownMenuLabel className="font-normal bg-blue-50 rounded-md m-1 p-3">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none text-gray-900">
                    {user?.firstName && user?.lastName 
                      ? `${user.firstName} ${user.lastName}` 
                      : user?.username || user?.email || 'User'}
                  </p>
                  {user?.email && (
                    <p className="text-xs leading-none text-gray-600">
                      {user.email}
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="text-gray-500">
                <User className="mr-2 h-4 w-4" />
                <span>User Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleReload} className="hover:bg-blue-50">
                <RotateCcw className="mr-2 h-4 w-4" />
                <span>Reload</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="text-gray-500">
                <Grid3X3 className="mr-2 h-4 w-4" />
                <span>Apps</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleViewWebsite} className="hover:bg-purple-50">
                <Globe className="mr-2 h-4 w-4" />
                <span>View Website</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-red-600 focus:text-red-600 focus:bg-red-50 hover:bg-red-50"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

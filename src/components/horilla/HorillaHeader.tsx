import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, Bell, MessageSquare, Settings, Menu, 
  ChevronDown, Moon, Sun, Maximize2, LogOut 
} from "lucide-react";

interface HorillaHeaderProps {
  onToggleSidebar: () => void;
}

export function HorillaHeader({ onToggleSidebar }: HorillaHeaderProps) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
      {/* Left: Menu toggle + Search */}
      <div className="flex items-center gap-3">
        <button 
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        
        <div className="relative">
          <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 py-1.5 w-72">
            <Search className="h-4 w-4 text-gray-400 mr-2" />
            <input 
              type="text"
              placeholder="Search..."
              className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full"
            />
            <kbd className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded ml-2">⌘K</kbd>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 relative transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        
        <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 relative transition-colors">
          <MessageSquare className="h-5 w-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#E8604C] rounded-full"></span>
        </button>

        <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <Maximize2 className="h-4 w-4" />
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1">
          <div className="w-8 h-8 rounded-full bg-[#E8604C] flex items-center justify-center text-white text-sm font-semibold">
            A
          </div>
          <div className="text-left hidden lg:block">
            <p className="text-sm font-medium text-gray-800 leading-none">Admin</p>
            <p className="text-xs text-gray-400 leading-none mt-0.5">HR Manager</p>
          </div>
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </div>

        {/* Back to ERP */}
        <button 
          onClick={() => navigate('/dashboard')}
          className="ml-2 p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Back to ERP"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

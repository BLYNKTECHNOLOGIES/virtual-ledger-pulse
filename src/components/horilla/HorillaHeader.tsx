import { useNavigate } from "react-router-dom";
import { Search, Bell, Moon, Menu, User } from "lucide-react";

interface HorillaHeaderProps {
  onToggleSidebar: () => void;
}

export function HorillaHeader({ onToggleSidebar }: HorillaHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 py-1.5 w-64">
          <Search className="h-4 w-4 text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Search anything..."
            className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <Moon className="h-5 w-5" />
        </button>

        <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 relative transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#6C63FF] rounded-full"></span>
        </button>

        <button
          onClick={() => navigate("/dashboard")}
          className="ml-1 w-9 h-9 rounded-full bg-[#6C63FF] flex items-center justify-center text-white hover:bg-[#5a52e0] transition-colors"
        >
          <User className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}

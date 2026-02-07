
import { Bell, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { HorillaNotifications } from "./HorillaNotifications";
import { useState } from "react";

interface HorillaHeaderProps {
  title: string;
}

export function HorillaHeader({ title }: HorillaHeaderProps) {
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/dashboard")}
          className="text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-gray-800">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search..."
            className="pl-9 w-64 h-9 bg-gray-50 border-gray-200 text-sm"
          />
        </div>

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-gray-500 hover:text-gray-700"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell className="h-5 w-5" />
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-[#E8604C] text-white border-2 border-white">
              3
            </Badge>
          </Button>
          {showNotifications && (
            <HorillaNotifications onClose={() => setShowNotifications(false)} />
          )}
        </div>
      </div>
    </header>
  );
}

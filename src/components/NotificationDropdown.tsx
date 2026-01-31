
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Settings, RefreshCw, User, LogOut, Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./ThemeToggle";
import { useNotificationMute } from "@/hooks/useNotificationMute";

export function NotificationDropdown() {
  const { isMuted, toggleMute } = useNotificationMute();
  const [notifications] = useState([
    { id: 1, title: "New Order Received", time: "2 minutes ago" },
    { id: 2, title: "Payment Confirmed", time: "5 minutes ago" },
    { id: 3, title: "COSMOS Alert", time: "10 minutes ago" },
  ]);

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {notifications.length > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center text-xs p-0"
            >
              {notifications.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
        </div>
        
        {notifications.length > 0 ? (
          <div className="max-h-64 overflow-y-auto">
            {notifications.map((notification) => (
              <DropdownMenuItem key={notification.id} className="p-4 cursor-pointer">
                <div className="flex flex-col space-y-1">
                  <span className="font-medium">{notification.title}</span>
                  <span className="text-sm text-muted-foreground">{notification.time}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        ) : (
          <div className="p-4 text-center text-muted-foreground">
            No new notifications
          </div>
        )}
        
        <DropdownMenuSeparator />
        
        <div className="p-2">
          <DropdownMenuItem onClick={toggleMute}>
            {isMuted ? (
              <>
                <VolumeX className="h-4 w-4 mr-2 text-destructive" />
                <span>Unmute Notifications</span>
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4 mr-2" />
                <span>Mute Notifications</span>
              </>
            )}
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleReload}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reload
          </DropdownMenuItem>
          
          <ThemeToggle />
          
          <DropdownMenuItem>
            <User className="h-4 w-4 mr-2" />
            Profile
          </DropdownMenuItem>
          
          <DropdownMenuItem>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

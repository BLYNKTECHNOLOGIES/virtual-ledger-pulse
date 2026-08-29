import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Settings, RefreshCw, User, LogOut, Volume2, VolumeX, CheckCheck, Trash2, AlertTriangle, Info, CheckCircle, BellOff, Inbox } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./ThemeToggle";
import { useNotificationMute } from "@/hooks/useNotificationMute";
import { useNotifications, GlobalNotification } from "@/contexts/NotificationContext";
import {
  useWorkflowNotifications,
  useMarkWorkflowNotificationRead,
  useMarkAllWorkflowNotificationsRead,
} from "@/hooks/useWorkflowNotifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";


function getNotificationIcon(type: GlobalNotification['type']) {
  switch (type) {
    case 'error':
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    case 'success':
      return <CheckCircle className="h-4 w-4 text-success" />;
    default:
      return <Info className="h-4 w-4 text-primary" />;
  }
}

export function NotificationDropdown() {
  const [tab, setTab] = useState<"requests" | "system">("requests");
  const { isMuted, toggleMute } = useNotificationMute();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount: liveUnread,
    markAllAsRead,
    clearNotifications,
    handleNotificationClick 
  } = useNotifications();

  const { data: workflow = [] } = useWorkflowNotifications();
  const markWorkflowRead = useMarkWorkflowNotificationRead();
  const markAllWorkflowRead = useMarkAllWorkflowNotificationsRead();
  const workflowUnread = workflow.filter((n) => !n.is_read).length;
  const unreadCount = liveUnread + workflowUnread;

  const openWorkflow = (n: { id: string; link: string | null }) => {
    markWorkflowRead.mutate(n.id);
    if (n.link) navigate(n.link);
  };


  const handleReload = () => {
    queryClient.invalidateQueries();
    toast({ title: "Refreshed", description: "All data has been refreshed." });
  };

  const handleToggleMute = () => {
    toggleMute();
    toast({
      title: isMuted ? "Notifications Unmuted" : "Notifications Muted",
      description: isMuted 
        ? "You will now hear notification sounds" 
        : "Notification sounds have been muted",
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          {isMuted ? (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Bell className={cn("h-4 w-4", unreadCount > 0 && "animate-pulse")} />
          )}
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center text-xs p-0 animate-bounce"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
          {/* Muted indicator */}
          {isMuted && (
            <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-muted-foreground rounded-full flex items-center justify-center">
              <VolumeX className="h-2 w-2 text-background" />
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] p-0 overflow-hidden"
      >
        <div className="px-3 py-2.5 border-b flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-sm truncate">Notifications</h3>
            {isMuted && (
              <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                <VolumeX className="h-3 w-3" />
                Muted
              </Badge>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {(notifications.length > 0 || workflowUnread > 0) && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => { markAllAsRead(); if (workflowUnread) markAllWorkflowRead.mutate(); }}
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3 w-3" />
                </Button>
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={clearNotifications}
                    title="Clear all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Source tabs — HR/workflow approvals kept separate from ERP system alerts */}
        <div className="grid grid-cols-2 border-b text-xs">
          {([
            { key: "requests" as const, label: "Requests", count: workflowUnread },
            { key: "system" as const, label: "System", count: liveUnread },
          ]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={(e) => { e.preventDefault(); setTab(t.key); }}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 font-medium transition-colors",
                tab === t.key
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count > 0 && (
                <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] leading-none tabular-nums">
                  {t.count > 99 ? "99+" : t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <ScrollArea className="h-[min(22rem,50vh)]">
          {tab === "requests" ? (
            workflow.length > 0 ? (
              <div className="divide-y">
                {workflow.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => openWorkflow(n)}
                    className={cn(
                      "p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                      !n.is_read && "bg-primary/5 border-l-2 border-l-primary",
                    )}
                  >
                    <div className="flex gap-3">
                      <Inbox className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm break-words", !n.is_read && "font-semibold")}>{n.title}</p>
                        {n.message && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">{n.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No pending requests</p>
              </div>
            )
          ) : notifications.length > 0 ? (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                    !notification.read && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm break-words", !notification.read && "font-semibold")}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">
                        {notification.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(notification.time, { addSuffix: true })}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No notifications</p>
            </div>
          )}
        </ScrollArea>

        <DropdownMenuSeparator className="my-0" />

        
        <div className="p-2">
          <DropdownMenuItem onClick={handleToggleMute}>
            {isMuted ? (
              <>
                <Volume2 className="h-4 w-4 mr-2 text-success" />
                <span>Unmute Sounds</span>
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4 mr-2 text-destructive" />
                <span>Mute Sounds</span>
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

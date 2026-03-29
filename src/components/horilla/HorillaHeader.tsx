import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Bell, Moon, Menu, User, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface HorillaHeaderProps {
  onToggleSidebar: () => void;
  isMobile?: boolean;
}

export function HorillaHeader({ onToggleSidebar, isMobile = false }: HorillaHeaderProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Fetch user's notification preferences
  const { data: preferences } = useQuery({
    queryKey: ["hr_notification_preferences_header"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) return null;
      const { data } = await (supabase as any).from("hr_notification_preferences")
        .select("*").eq("employee_id", user.user.id).maybeSingle();
      return data;
    },
  });

  const { data: rawNotifications = [] } = useQuery({
    queryKey: ["hr_notifications"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Filter notifications by preferences
  const notifications = useMemo(() => {
    if (!preferences) return rawNotifications;
    return rawNotifications.filter((n: any) => {
      const type = n.notification_type || n.type || "";
      if (type.includes("leave") && preferences.leave_notifications === false) return false;
      if (type.includes("attendance") && preferences.attendance_notifications === false) return false;
      if (type.includes("payroll") && preferences.payroll_notifications === false) return false;
      if (type.includes("announcement") && preferences.announcement_notifications === false) return false;
      return true;
    });
  }, [rawNotifications, preferences]);

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("hr_notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications.filter((n: any) => !n.is_read).map((n: any) => n.id);
      if (unreadIds.length) {
        await (supabase as any).from("hr_notifications").update({ is_read: true }).in("id", unreadIds);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_notifications"] }),
  });

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-3 md:px-4 shrink-0 gap-2">
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 py-1.5 min-w-0 w-full sm:w-64 sm:max-w-none max-w-[220px]">
          <Search className="h-4 w-4 text-gray-400 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search anything..."
            className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full min-w-0"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isMobile && (
          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <Moon className="h-5 w-5" />
          </button>
        )}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 relative transition-colors">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => markAllReadMutation.mutate()}>
                  <Check className="h-3 w-3 mr-1" /> Mark all read
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-[350px]">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
              ) : notifications.map((n: any) => (
                <div
                  key={n.id}
                  className={`px-3 py-2.5 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition ${!n.is_read ? "bg-blue-50/50" : ""}`}
                  onClick={() => {
                    if (!n.is_read) markReadMutation.mutate(n.id);
                    if (n.link) { navigate(n.link); setOpen(false); }
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!n.is_read ? "font-medium" : "text-muted-foreground"}`}>{n.title}</p>
                      {n.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(n.created_at), "dd MMM, h:mm a")}</p>
                    </div>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </PopoverContent>
        </Popover>

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

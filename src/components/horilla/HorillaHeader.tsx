import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Bell, Moon, Sun, Menu, User, Check } from "lucide-react";
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
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  const toggleDarkMode = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
    setIsDark(next);
  };

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
      const { data: user } = await supabase.auth.getUser();
      const uid = user?.user?.id;
      if (!uid) return [];
      const { data } = await (supabase as any).from("hr_notifications")
        .select("*")
        .or(`user_id.eq.${uid},employee_id.eq.${uid}`)
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
    <header className="h-12 md:h-14 bg-card/90 backdrop-blur-sm border-b border-border flex items-center justify-between px-2 md:px-4 shrink-0 gap-2 supports-[padding:max(0px)]:pt-[max(0px,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0 active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center bg-muted/60 rounded-lg border border-border px-3 py-1.5 min-w-0 w-full sm:w-64 sm:max-w-none max-w-[220px] focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40 transition-all">
          <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search…"
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full min-w-0"
          />
        </div>
      </div>


      <div className="flex items-center gap-1 shrink-0">
        {!isMobile && (
          <button
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        )}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground relative transition-colors">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-destructive text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
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
                  className={`px-3 py-2.5 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition ${!n.is_read ? "bg-info/10" : ""}`}
                  onClick={() => {
                    if (!n.is_read) markReadMutation.mutate(n.id);
                    if (n.link) { navigate(n.link); setOpen(false); }
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-info mt-1.5 shrink-0" />}
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
          aria-label="Open ERP dashboard"
          className="ml-1 w-8 h-8 md:w-9 md:h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 active:scale-95 transition-all shadow-sm"
        >
          <User className="h-4 w-4 md:h-5 md:w-5" />
        </button>

      </div>
    </header>
  );
}

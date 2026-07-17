import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Megaphone, Pin, ArrowRight } from "lucide-react";
import { format } from "date-fns";

/**
 * Read-side surface for hr_announcements.
 * Shows the top pinned/recent live announcements on the HRMS dashboard.
 * Filters on published=true AND (expires_at IS NULL OR expires_at > now()).
 */
export function AnnouncementsBanner() {
  const navigate = useNavigate();

  const { data: announcements = [] } = useQuery({
    queryKey: ["hr_announcements_live"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("hr_announcements")
        .select("id, title, content, category, is_pinned, created_at, expires_at")
        .eq("published", true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
  });

  if (!announcements.length) return null;

  const categoryColor = (c: string) => {
    switch (c) {
      case "urgent": return "bg-destructive/10 text-destructive border-destructive/20";
      case "policy": return "bg-info/10 text-info border-info/20";
      case "event": return "bg-warning/10 text-warning border-warning/20";
      default: return "bg-muted/80 text-muted-foreground border-border";
    }
  };

  return (
    <Card className="border-[#E8604C]/20 bg-gradient-to-br from-[#E8604C]/5 to-transparent">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[#E8604C]" />
            <h3 className="text-sm font-semibold text-foreground">Announcements</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => navigate("/hrms/announcements")}
          >
            View all <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
        <div className="space-y-2">
          {announcements.map((a: any) => (
            <div
              key={a.id}
              className="rounded-lg border border-border bg-card/50 p-3 hover:bg-card transition-colors"
            >
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {a.is_pinned && <Pin className="h-3 w-3 text-[#E8604C]" />}
                <p className="font-medium text-sm text-foreground">{a.title}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${categoryColor(a.category)}`}>
                  {a.category || "general"}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
                  {format(new Date(a.created_at), "d MMM")}
                </span>
              </div>
              {a.content && (
                <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                  {a.content}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

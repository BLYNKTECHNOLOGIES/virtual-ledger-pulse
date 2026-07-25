import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Alert card shown on the Attendance Overview page whenever the watchdog
// has open (unresolved) stale sessions. Deep-links to the resolution page.
export function StaleSessionAlert() {
  const { data } = useQuery({
    queryKey: ["hr_stale_sessions_count_open"],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("hr_attendance_stale_sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 60_000,
  });

  if (!data) return null;

  return (
    <Card className="border-amber-500/60 bg-amber-500/5">
      <CardContent className="p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {data} stale attendance session{data === 1 ? "" : "s"} open &gt;12h
            </div>
            <div className="text-xs text-muted-foreground truncate">
              Resolve to prevent unfair LOP for forgotten out-punches.
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/hrms/attendance/stale-sessions">
            Resolve <ChevronRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

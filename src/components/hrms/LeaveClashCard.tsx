import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";

/**
 * Leave-clash detector: for every day in the next N days, counts employees on
 * approved leave. Flags days where >= threshold employees overlap so HR can
 * catch coverage gaps before they become incidents.
 */
export function LeaveClashCard({ defaultThreshold = 3, horizonDays = 60 }: { defaultThreshold?: number; horizonDays?: number }) {
  const [threshold, setThreshold] = useState(defaultThreshold);

  const { data: leaves = [] } = useQuery({
    queryKey: ["hr_leave_clash_source", horizonDays],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const end = format(new Date(Date.now() + horizonDays * 86400000), "yyyy-MM-dd");
      const { data, error } = await (supabase as any)
        .from("hr_leave_requests")
        .select("employee_id, start_date, end_date, hr_employees!hr_leave_requests_employee_id_fkey(first_name, last_name)")
        .eq("status", "approved")
        .gte("end_date", today)
        .lte("start_date", end);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const clashes = useMemo(() => {
    const byDate = new Map<string, { employee_id: string; name: string }[]>();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const l of leaves) {
      const start = new Date(l.start_date);
      const end = new Date(l.end_date);
      const from = start < today ? today : start;
      for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
        const key = format(d, "yyyy-MM-dd");
        const arr = byDate.get(key) || [];
        arr.push({
          employee_id: l.employee_id,
          name: l.hr_employees ? `${l.hr_employees.first_name} ${l.hr_employees.last_name}` : "—",
        });
        byDate.set(key, arr);
      }
    }
    return Array.from(byDate.entries())
      .filter(([, list]) => list.length >= threshold)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 30);
  }, [leaves, threshold]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Leave Clash Radar (next {horizonDays} days)
        </CardTitle>
        <div className="flex items-center gap-2">
          <Label htmlFor="clash-threshold" className="text-xs text-muted-foreground">Threshold</Label>
          <Input
            id="clash-threshold"
            type="number"
            min={2}
            value={threshold}
            onChange={(e) => setThreshold(Math.max(2, Number(e.target.value) || 2))}
            className="w-16 h-8 text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {clashes.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            No clashes with {threshold}+ approved leaves in the window.
          </div>
        ) : (
          <div className="divide-y max-h-[280px] overflow-y-auto">
            {clashes.map(([date, list]) => (
              <div key={date} className="px-4 py-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium tabular-nums">{format(new Date(date), "EEE, dd MMM yyyy")}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[420px]">
                    {list.map((p) => p.name).join(", ")}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-warning/10 text-warning border-warning/20 tabular-nums shrink-0">
                  {list.length} off
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LeaveClashCard;

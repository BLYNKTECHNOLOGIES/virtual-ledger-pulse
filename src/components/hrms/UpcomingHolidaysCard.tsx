import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { format, differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Read-only widget showing the next 5 upcoming company holidays.
 * Sourced from hr_holidays (is_active = true), forward-looking only.
 */
export function UpcomingHolidaysCard() {
  const { data: holidays = [] } = useQuery({
    queryKey: ["hr_holidays_upcoming"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("hr_holidays")
        .select("id, name, date, recurring")
        .eq("is_active", true)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(5);
      return data || [];
    },
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Upcoming Holidays
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No upcoming holidays on the calendar.
          </p>
        ) : (
          <ul className="space-y-2">
            {holidays.map((h: any) => {
              const d = parseISO(h.date);
              const days = differenceInCalendarDays(d, new Date());
              const label =
                days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`;
              return (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-3 text-sm py-1.5 border-b last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{h.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(d, "EEE, dd MMM yyyy")}
                      {h.recurring ? " · recurring" : ""}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-primary shrink-0">
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Users, UserCheck, UserX, Clock, Activity } from "lucide-react";

export function LiveAttendanceDashboard() {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: employees } = useQuery({
    queryKey: ["hr-employees-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, profile_image_url")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: todayAttendance } = useQuery({
    queryKey: ["hr-attendance-today", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_attendance")
        .select("*")
        .eq("attendance_date", today);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: todayActivity } = useQuery({
    queryKey: ["hr-attendance-activity-today", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_attendance_activity")
        .select("*")
        .eq("activity_date", today)
        .order("clock_in", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const totalEmployees = employees?.length ?? 0;
  const presentCount = todayAttendance?.filter(
    (a) => a.attendance_status === "present"
  ).length ?? 0;
  const absentCount = totalEmployees - presentCount;

  // Build a map: employee_id -> latest activity
  const activityMap = new Map<string, typeof todayActivity extends (infer T)[] | null ? T : never>();
  todayActivity?.forEach((act) => {
    if (!activityMap.has(act.employee_id)) {
      activityMap.set(act.employee_id, act);
    }
  });

  // Determine "in office" = clocked in but not clocked out
  const inOfficeCount = Array.from(activityMap.values()).filter(
    (a) => a.clock_in && !a.clock_out
  ).length;

  const getEmployeeName = (empId: string) => {
    const emp = employees?.find((e) => e.id === empId);
    return emp ? `${emp.first_name} ${emp.last_name}` : "Unknown";
  };

  const getBadgeId = (empId: string) => {
    const emp = employees?.find((e) => e.id === empId);
    return emp?.badge_id ?? "-";
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return "-";
    try {
      return format(new Date(ts), "hh:mm a");
    } catch {
      return ts;
    }
  };

  const calcHours = (clockIn: string | null, clockOut: string | null) => {
    if (!clockIn || !clockOut) return "-";
    try {
      const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime();
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      return `${hrs}h ${mins}m`;
    } catch {
      return "-";
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{totalEmployees}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <UserCheck className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Present</p>
              <p className="text-2xl font-bold text-green-600">{presentCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <UserX className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Absent</p>
              <p className="text-2xl font-bold text-destructive">{absentCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">In Office Now</p>
              <p className="text-2xl font-bold text-blue-600">{inOfficeCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee Status Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" />
            Live Employee Status — {format(new Date(), "dd MMM yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!employees?.length ? (
            <p className="text-muted-foreground text-sm text-center py-6">No active employees found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {employees.map((emp) => {
                const activity = activityMap.get(emp.id);
                const isInOffice = activity?.clock_in && !activity?.clock_out;
                const hasLeft = activity?.clock_in && activity?.clock_out;

                return (
                  <div
                    key={emp.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className="relative">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
                        {emp.first_name[0]}{emp.last_name[0]}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
                          isInOffice
                            ? "bg-green-500"
                            : hasLeft
                            ? "bg-amber-500"
                            : "bg-muted-foreground/30"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {emp.first_name} {emp.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Badge: {emp.badge_id}
                      </p>
                    </div>
                    <Badge
                      variant={isInOffice ? "default" : hasLeft ? "secondary" : "outline"}
                      className="text-xs shrink-0"
                    >
                      {isInOffice ? "In Office" : hasLeft ? "Left" : "Not In"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Punch Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5" />
            Today's Punch Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!todayActivity?.length ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              No punches recorded yet today. Data will appear once ESSL middleware starts syncing.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Employee</th>
                    <th className="pb-2 font-medium text-muted-foreground">Badge</th>
                    <th className="pb-2 font-medium text-muted-foreground">Clock In</th>
                    <th className="pb-2 font-medium text-muted-foreground">Clock Out</th>
                    <th className="pb-2 font-medium text-muted-foreground">Hours</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todayActivity.map((act) => {
                    const isInOffice = act.clock_in && !act.clock_out;
                    return (
                      <tr key={act.id} className="border-b last:border-0">
                        <td className="py-2.5 font-medium">{getEmployeeName(act.employee_id)}</td>
                        <td className="py-2.5 text-muted-foreground">{getBadgeId(act.employee_id)}</td>
                        <td className="py-2.5">{formatTime(act.clock_in)}</td>
                        <td className="py-2.5">{formatTime(act.clock_out)}</td>
                        <td className="py-2.5">{calcHours(act.clock_in, act.clock_out)}</td>
                        <td className="py-2.5">
                          <Badge
                            variant={isInOffice ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {isInOffice ? "Working" : "Completed"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

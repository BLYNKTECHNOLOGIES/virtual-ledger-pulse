import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, CalendarDays, AlertTriangle, TrendingUp, Timer, CheckCircle } from 'lucide-react';

interface AttendanceTabProps {
  employeeId: string;
}

export default function AttendanceTab({ employeeId }: AttendanceTabProps) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const monthStart = `${selectedMonth}-01`;
  const [y, m] = selectedMonth.split('-').map(Number);
  const monthEnd = `${selectedMonth}-${new Date(y, m, 0).getDate()}`;

  // Monthly summary from view
  const { data: monthlySummary } = useQuery({
    queryKey: ['hr_monthly_hours_summary', employeeId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_monthly_hours_summary')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('month', monthStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });

  // Daily attendance records for the month
  const { data: dailyRecords = [], isLoading } = useQuery({
    queryKey: ['hr_attendance_daily', employeeId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_attendance')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('attendance_date', monthStart)
        .lte('attendance_date', monthEnd)
        .order('attendance_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  // Late/early records for the month
  const { data: lateEarlyRecords = [] } = useQuery({
    queryKey: ['hr_late_early', employeeId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_late_come_early_out')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('attendance_date', monthStart)
        .lte('attendance_date', monthEnd)
        .order('attendance_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  // Generate last 6 months for dropdown
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    return { value: val, label };
  });

  const s = monthlySummary;
  const workedHrs = Number(s?.total_worked_hours || 0);
  const otHrs = Number(s?.total_overtime_hours || 0);
  const presentDays = Number(s?.present_days || 0);
  const absentDays = Number(s?.absent_days || 0);
  const lateCount = Number(s?.late_count || 0);
  const earlyCount = Number(s?.early_out_count || 0);
  const totalLateMins = Number(s?.total_late_minutes || 0);

  const statusColor = (status: string) => {
    switch (status) {
      case 'present': return 'bg-green-100 text-green-700';
      case 'late': return 'bg-amber-100 text-amber-700';
      case 'absent': return 'bg-red-100 text-red-700';
      case 'half_day': return 'bg-blue-100 text-blue-700';
      case 'on_leave': return 'bg-purple-100 text-purple-700';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Attendance & Hours</h3>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{presentDays}</p>
            <p className="text-xs text-muted-foreground">Present Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CalendarDays className="h-5 w-5 text-red-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{absentDays}</p>
            <p className="text-xs text-muted-foreground">Absent Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 text-blue-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{workedHrs.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Worked Hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 text-purple-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{otHrs.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Overtime Hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{lateCount}</p>
            <p className="text-xs text-muted-foreground">Late Marks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Timer className="h-5 w-5 text-orange-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{earlyCount}</p>
            <p className="text-xs text-muted-foreground">Early Outs</p>
          </CardContent>
        </Card>
      </div>

      {/* Late/Early alerts */}
      {lateEarlyRecords.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Late Come / Early Out Records</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Expected</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Actual</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {lateEarlyRecords.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2">{r.attendance_date}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.type === 'late_come' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {r.type === 'late_come' ? 'Late Come' : 'Early Out'}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{r.expected_time?.slice(0, 5)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.actual_time?.slice(0, 5)}</td>
                      <td className="px-4 py-2 font-medium text-red-600">{r.difference_minutes} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily records */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Daily Attendance Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : dailyRecords.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No attendance records for this month</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Check In</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Check Out</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Hours</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Late</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">OT</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRecords.map((r: any) => {
                    const hrs = r.check_in && r.check_out
                      ? ((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000).toFixed(1)
                      : '—';
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{r.attendance_date}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.attendance_status)}`}>
                            {r.attendance_status}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{formatTime(r.check_in)}</td>
                        <td className="px-4 py-2 font-mono text-xs">{formatTime(r.check_out)}</td>
                        <td className="px-4 py-2">{hrs}h</td>
                        <td className="px-4 py-2">
                          {r.late_minutes > 0 
                            ? <span className="text-amber-600 font-medium">{r.late_minutes}m</span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="px-4 py-2">
                          {r.overtime_hours > 0
                            ? <span className="text-purple-600 font-medium">{r.overtime_hours}h</span>
                            : <span className="text-muted-foreground">—</span>
                          }
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


import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Calendar, Users, CheckCircle, XCircle, AlertTriangle, Filter, Plus, Search, LogIn, LogOut, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

interface AttendanceRecord {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  attendance_status: string;
  work_type: string;
  overtime_hours: number;
  late_minutes: number;
  notes: string | null;
  hr_employees?: {
    first_name: string;
    last_name: string;
    badge_id: string;
    profile_image_url: string | null;
  };
}

export function AttendanceDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const queryClient = useQueryClient();

  const { data: attendanceRecords = [], isLoading } = useQuery({
    queryKey: ["hr_attendance", selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_attendance")
        .select("*, hr_employees(first_name, last_name, badge_id, profile_image_url)")
        .eq("attendance_date", selectedDate)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AttendanceRecord[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, profile_image_url")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: monthlyStats } = useQuery({
    queryKey: ["hr_attendance_monthly"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
      const endOfMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("hr_attendance")
        .select("attendance_status")
        .gte("attendance_date", startOfMonth)
        .lte("attendance_date", endOfMonth);
      if (error) throw error;
      const present = data.filter((r) => r.attendance_status === "present").length;
      const absent = data.filter((r) => r.attendance_status === "absent").length;
      const late = data.filter((r) => r.attendance_status === "late").length;
      return { total: data.length, present, absent, late };
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase.from("hr_attendance").insert({
        employee_id: employeeId,
        attendance_date: format(new Date(), "yyyy-MM-dd"),
        check_in: new Date().toISOString(),
        attendance_status: "present",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_attendance"] });
      toast.success("Checked in successfully");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const checkOutMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase
        .from("hr_attendance")
        .update({ check_out: new Date().toISOString() })
        .eq("id", recordId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_attendance"] });
      toast.success("Checked out successfully");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const presentCount = attendanceRecords.filter((r) => r.attendance_status === "present").length;
  const absentCount = employees.length - presentCount;
  const lateCount = attendanceRecords.filter((r) => r.attendance_status === "late").length;

  const filteredRecords = attendanceRecords.filter((r) => {
    const name = `${r.hr_employees?.first_name} ${r.hr_employees?.last_name}`.toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-gray-100">
            <TabsTrigger value="overview" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Overview
            </TabsTrigger>
            <TabsTrigger value="records" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Attendance Records
            </TabsTrigger>
            <TabsTrigger value="clock" className="data-[state=active]:bg-[#009C4A] data-[state=active]:text-white">
              Clock In/Out
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-44"
            />
          </div>
        </div>

        <TabsContent value="overview">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-l-4 border-l-[#009C4A]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Employees</p>
                    <p className="text-2xl font-bold">{employees.length}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[#009C4A]/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-[#009C4A]" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Present Today</p>
                    <p className="text-2xl font-bold text-green-600">{presentCount}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Absent Today</p>
                    <p className="text-2xl font-bold text-red-600">{absentCount}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-yellow-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Late Arrivals</p>
                    <p className="text-2xl font-bold text-yellow-600">{lateCount}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#009C4A]" />
                Monthly Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold">{monthlyStats?.total || 0}</p>
                  <p className="text-sm text-gray-500">Total Records</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{monthlyStats?.present || 0}</p>
                  <p className="text-sm text-gray-500">Present</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{monthlyStats?.absent || 0}</p>
                  <p className="text-sm text-gray-500">Absent</p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{monthlyStats?.late || 0}</p>
                  <p className="text-sm text-gray-500">Late</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Attendance Records - {format(new Date(selectedDate), "MMMM dd, yyyy")}</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search employee..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 w-64"
                    />
                  </div>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-1" /> Filter
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Badge ID</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Work Type</TableHead>
                    <TableHead>Overtime (hrs)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No attendance records for this date
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#009C4A]/10 flex items-center justify-center text-xs font-bold text-[#009C4A]">
                              {record.hr_employees?.first_name?.[0]}{record.hr_employees?.last_name?.[0]}
                            </div>
                            <span className="font-medium">{record.hr_employees?.first_name} {record.hr_employees?.last_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-500">{record.hr_employees?.badge_id}</TableCell>
                        <TableCell>{record.check_in ? format(new Date(record.check_in), "hh:mm a") : "-"}</TableCell>
                        <TableCell>{record.check_out ? format(new Date(record.check_out), "hh:mm a") : "-"}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              record.attendance_status === "present"
                                ? "bg-green-100 text-green-700"
                                : record.attendance_status === "late"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }
                          >
                            {record.attendance_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{record.work_type}</TableCell>
                        <TableCell>{record.overtime_hours}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clock">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Timer className="h-5 w-5 text-[#009C4A]" />
                Clock In / Out
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employees.map((emp) => {
                  const todayRecord = attendanceRecords.find((r) => r.employee_id === emp.id);
                  const isCheckedIn = todayRecord && !todayRecord.check_out;
                  const isCheckedOut = todayRecord && todayRecord.check_out;

                  return (
                    <div key={emp.id} className="p-4 border rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#009C4A]/10 flex items-center justify-center text-sm font-bold text-[#009C4A]">
                          {emp.first_name[0]}{emp.last_name[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{emp.first_name} {emp.last_name}</p>
                          <p className="text-xs text-gray-500">{emp.badge_id}</p>
                          {todayRecord?.check_in && (
                            <p className="text-xs text-green-600">In: {format(new Date(todayRecord.check_in), "hh:mm a")}</p>
                          )}
                        </div>
                      </div>
                      <div>
                        {isCheckedOut ? (
                          <Badge className="bg-gray-100 text-gray-600">Done</Badge>
                        ) : isCheckedIn ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => checkOutMutation.mutate(todayRecord!.id)}
                          >
                            <LogOut className="h-3 w-3 mr-1" /> Out
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-[#009C4A] hover:bg-[#008040] text-white"
                            onClick={() => checkInMutation.mutate(emp.id)}
                          >
                            <LogIn className="h-3 w-3 mr-1" /> In
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {employees.length === 0 && (
                  <div className="col-span-3 text-center py-12 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No active employees found</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Download, Upload, Mail, Phone } from "lucide-react";
import { ViewToggle } from "../shared/ViewToggle";
import { StatusBadge } from "../shared/StatusBadge";
import { AddEmployeeDialog } from "./AddEmployeeDialog";
import { EmployeeProfile } from "./EmployeeProfile";

export function EmployeeDirectory() {
  const [view, setView] = useState<"card" | "list">("card");
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  const { data: employees = [], isLoading, refetch } = useQuery({
    queryKey: ["hr_employees_directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("*, hr_employee_work_info(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["hr_departments_list"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name");
      return data || [];
    },
  });

  const filtered = employees.filter((emp: any) => {
    const matchSearch = !search || `${emp.first_name} ${emp.last_name} ${emp.email} ${emp.badge_id}`.toLowerCase().includes(search.toLowerCase());
    const matchGender = genderFilter === "all" || emp.gender === genderFilter;
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? emp.is_active : !emp.is_active);
    return matchSearch && matchGender && matchStatus;
  });

  if (selectedEmployee) {
    return <EmployeeProfile employeeId={selectedEmployee} onBack={() => setSelectedEmployee(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Employee Directory</h2>
          <p className="text-sm text-gray-500">{filtered.length} employees found</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowAddDialog(true)}
            className="bg-[#E8604C] hover:bg-[#d04a38] text-white"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Employee
          </Button>
          <Button variant="outline" size="icon"><Upload className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon"><Download className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, or badge ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={genderFilter} onValueChange={setGenderFilter}>
              <SelectTrigger className="w-[130px] h-9 text-sm">
                <SelectValue placeholder="Gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genders</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <ViewToggle view={view} onViewChange={setView} />
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8604C]" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">No employees found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or add a new employee</p>
          </CardContent>
        </Card>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((emp: any) => (
            <Card
              key={emp.id}
              className="border-0 shadow-md hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => setSelectedEmployee(emp.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] font-bold text-lg shrink-0 group-hover:bg-[#E8604C] group-hover:text-white transition-colors">
                    {emp.first_name[0]}{emp.last_name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 truncate">{emp.first_name} {emp.last_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{emp.badge_id}</p>
                    <StatusBadge status={emp.is_active ? "active" : "inactive"} className="mt-1.5" />
                  </div>
                </div>
                <div className="mt-4 space-y-1.5 text-xs text-gray-500">
                  {emp.email && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="h-3 w-3 shrink-0" /> {emp.email}
                    </div>
                  )}
                  {emp.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 shrink-0" /> {emp.phone}
                    </div>
                  )}
                  {emp.hr_employee_work_info?.[0]?.job_role && (
                    <p className="text-[#E8604C] font-medium">{emp.hr_employee_work_info[0].job_role}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-0 shadow-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold">Badge ID</TableHead>
                <TableHead className="text-xs font-semibold">Name</TableHead>
                <TableHead className="text-xs font-semibold">Email</TableHead>
                <TableHead className="text-xs font-semibold">Phone</TableHead>
                <TableHead className="text-xs font-semibold">Gender</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp: any) => (
                <TableRow key={emp.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedEmployee(emp.id)}>
                  <TableCell className="font-mono text-xs">{emp.badge_id}</TableCell>
                  <TableCell className="font-medium">{emp.first_name} {emp.last_name}</TableCell>
                  <TableCell className="text-sm text-gray-500">{emp.email || "-"}</TableCell>
                  <TableCell className="text-sm text-gray-500">{emp.phone || "-"}</TableCell>
                  <TableCell className="text-sm capitalize">{emp.gender || "-"}</TableCell>
                  <TableCell><StatusBadge status={emp.is_active ? "active" : "inactive"} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AddEmployeeDialog open={showAddDialog} onOpenChange={setShowAddDialog} onSuccess={refetch} />
    </div>
  );
}

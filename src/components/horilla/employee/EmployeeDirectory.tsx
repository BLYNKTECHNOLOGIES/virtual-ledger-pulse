
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Filter, MoreVertical, Mail, Phone } from "lucide-react";
import { ViewToggle } from "../shared/ViewToggle";
import { StatusBadge } from "../shared/StatusBadge";
import { AddEmployeeDialog } from "./AddEmployeeDialog";
import { EmployeeProfile } from "./EmployeeProfile";

export function EmployeeDirectory() {
  const [view, setView] = useState<"card" | "list">("card");
  const [search, setSearch] = useState("");
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

  const filtered = employees.filter((emp: any) => {
    return !search || `${emp.first_name} ${emp.last_name} ${emp.email} ${emp.badge_id}`.toLowerCase().includes(search.toLowerCase());
  });

  if (selectedEmployee) {
    return <EmployeeProfile employeeId={selectedEmployee} onBack={() => setSelectedEmployee(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm border-gray-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onViewChange={setView} />
          <Button variant="outline" size="sm" className="h-9 text-xs text-gray-600">
            <Filter className="h-3.5 w-3.5 mr-1" /> Filter
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs text-gray-600">
            Actions
          </Button>
          <Button
            onClick={() => setShowAddDialog(true)}
            size="sm"
            className="h-9 bg-[#009C4A] hover:bg-[#008040] text-white text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Create
          </Button>
        </div>
      </div>

      {/* Active filters placeholder */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#009C4A] font-medium">Filters:</span>
        <span className="text-gray-400">No active filters</span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#009C4A]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Search className="h-10 w-10 mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No employees found</p>
        </div>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((emp: any) => (
            <Card
              key={emp.id}
              className="border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              onClick={() => setSelectedEmployee(emp.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-sm shrink-0">
                      {emp.first_name[0]}{emp.last_name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{emp.first_name} {emp.last_name}</p>
                      <p className="text-[11px] text-gray-400">{emp.email || emp.badge_id}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-300 opacity-0 group-hover:opacity-100">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {emp.hr_employee_work_info?.[0]?.job_role && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {emp.hr_employee_work_info[0].job_role}
                    </span>
                  )}
                  <StatusBadge status={emp.is_active ? "active" : "inactive"} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border border-gray-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs font-semibold">Employee</TableHead>
                <TableHead className="text-xs font-semibold">Badge ID</TableHead>
                <TableHead className="text-xs font-semibold">Email</TableHead>
                <TableHead className="text-xs font-semibold">Phone</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp: any) => (
                <TableRow key={emp.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedEmployee(emp.id)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-[10px] font-bold">
                        {emp.first_name[0]}{emp.last_name[0]}
                      </div>
                      <span className="text-sm font-medium">{emp.first_name} {emp.last_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-gray-500">{emp.badge_id}</TableCell>
                  <TableCell className="text-xs text-gray-500">{emp.email || "—"}</TableCell>
                  <TableCell className="text-xs text-gray-500">{emp.phone || "—"}</TableCell>
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

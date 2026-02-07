
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Mail, Phone, Settings, MoreVertical, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface EmployeeProfileProps {
  employeeId: string;
  onBack: () => void;
}

const tabs = [
  "About", "Work Type & Shift", "Groups & Permissions", "Note", "Documents",
  "Mail Log", "History", "Scheduled Interviews", "Leave", "Performance",
  "Key Results", "Asset", "Attendance", "Penalty Account", "Payroll",
  "Allowance & Deduction", "Bonus Points", "Resignation", "Projects",
];

export function EmployeeProfile({ employeeId, onBack }: EmployeeProfileProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("About");
  const [newNote, setNewNote] = useState("");

  const { data: employee, isLoading, refetch } = useQuery({
    queryKey: ["hr_employee_profile", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("*, hr_employee_work_info(*), hr_employee_bank_details(*), hr_employee_notes(*)")
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments_for_profile"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name");
      return data || [];
    },
  });

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await supabase.from("hr_employee_notes").insert({ employee_id: employeeId, description: newNote });
    setNewNote("");
    refetch();
    toast({ title: "Note added" });
  };

  if (isLoading || !employee) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#009C4A]" />
      </div>
    );
  }

  const workInfo: any = employee.hr_employee_work_info?.[0] || {};
  const bankDetails: any = employee.hr_employee_bank_details?.[0] || {};
  const notes: any[] = employee.hr_employee_notes || [];
  const deptName = departments.find((d: any) => d.id === workInfo.department_id)?.name || "—";

  return (
    <div className="space-y-4">
      {/* Profile Header */}
      <Card className="border border-gray-100 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack} className="text-gray-400 hover:text-gray-600 -ml-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xl font-bold">
                {employee.first_name[0]}{employee.last_name[0]}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {employee.first_name} {employee.last_name}{" "}
                  <span className="text-sm font-normal text-gray-400">({employee.badge_id})</span>
                </h2>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  {employee.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {employee.email}
                    </span>
                  )}
                  {employee.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {employee.phone}
                    </span>
                  )}
                  {employee.gender && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {employee.gender}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-white border border-gray-100 rounded-lg p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              activeTab === tab
                ? "bg-[#009C4A] text-white"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "About" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Personal Information */}
          <Card className="border border-gray-100 shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Personal Information</h3>
              <div className="space-y-3">
                {[
                  ["Date of birth", employee.dob ? new Date(employee.dob).toLocaleDateString() : "—"],
                  ["Gender", employee.gender || "—"],
                  ["Address", employee.address || "—"],
                  ["Country", employee.country || "—"],
                  ["State", employee.state || "—"],
                  ["City", employee.city || "—"],
                  ["Qualification", employee.qualification || "—"],
                  ["Experience", employee.experience || "—"],
                  ["Emergency Contact", employee.emergency_contact || "—"],
                  ["Emergency Contact Name", employee.emergency_contact_name || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start">
                    <span className="text-xs text-gray-400 w-40 shrink-0">{label}</span>
                    <span className="text-xs text-gray-700">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Work Information */}
          <Card className="border border-gray-100 shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Work Information</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["Badge Id", "Job Position", "Department", "Shift", "Work Type", "Employee Type", "Job Role", "Reporting Manager"].map(h => (
                        <th key={h} className="text-left py-2 px-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-50">
                      <td className="py-2 px-2 text-gray-700">{employee.badge_id}</td>
                      <td className="py-2 px-2 text-gray-700">{workInfo.job_role || "—"}</td>
                      <td className="py-2 px-2 text-gray-700">{deptName}</td>
                      <td className="py-2 px-2 text-gray-700">—</td>
                      <td className="py-2 px-2 text-gray-700">{workInfo.work_type || "—"}</td>
                      <td className="py-2 px-2 text-gray-700">{workInfo.employee_type || "—"}</td>
                      <td className="py-2 px-2 text-gray-700">{workInfo.job_role || "—"}</td>
                      <td className="py-2 px-2 text-gray-700">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "Note" && (
        <Card className="border border-gray-100 shadow-sm">
          <CardContent className="p-5">
            <div className="flex gap-2 mb-4">
              <Textarea
                placeholder="Add a note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="text-sm min-h-[60px]"
              />
              <Button onClick={handleAddNote} className="bg-[#009C4A] hover:bg-[#008040] shrink-0">
                Add
              </Button>
            </div>
            <div className="space-y-3">
              {notes.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No notes yet</p>}
              {notes.map((note: any) => (
                <div key={note.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">{note.description}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{new Date(note.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!["About", "Note"].includes(activeTab) && (
        <Card className="border border-gray-100 shadow-sm">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">🚧</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-700">{activeTab}</h3>
            <p className="text-xs text-gray-400 mt-1">This section will be available in a future phase</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

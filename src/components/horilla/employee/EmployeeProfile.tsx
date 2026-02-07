
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Briefcase, Building, CreditCard, StickyNote, Edit2, Save, X } from "lucide-react";
import { StatusBadge } from "../shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface EmployeeProfileProps {
  employeeId: string;
  onBack: () => void;
}

export function EmployeeProfile({ employeeId, onBack }: EmployeeProfileProps) {
  const { toast } = useToast();
  const [editingField, setEditingField] = useState<string | null>(null);

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

  const { data: bonusPoints = [] } = useQuery({
    queryKey: ["hr_bonus_points", employeeId],
    queryFn: async () => {
      const { data } = await supabase.from("hr_bonus_points").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false });
      return data || [];
    },
  });

  const [newNote, setNewNote] = useState("");
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await supabase.from("hr_employee_notes").insert({ employee_id: employeeId, description: newNote });
    setNewNote("");
    refetch();
    toast({ title: "Note added" });
  };

  const toggleActive = async () => {
    if (!employee) return;
    await supabase.from("hr_employees").update({ is_active: !employee.is_active }).eq("id", employeeId);
    refetch();
    toast({ title: employee.is_active ? "Employee archived" : "Employee reactivated" });
  };

  if (isLoading || !employee) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8604C]" />
      </div>
    );
  }

  const workInfo: any = employee.hr_employee_work_info?.[0] || {};
  const bankDetails: any = employee.hr_employee_bank_details?.[0] || {};
  const notes: any[] = employee.hr_employee_notes || [];
  const totalBonus = bonusPoints.reduce((sum: number, bp: any) => sum + bp.points, 0);

  const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-700">{value || "—"}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-16 h-16 rounded-full bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] font-bold text-2xl">
            {employee.first_name[0]}{employee.last_name[0]}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{employee.first_name} {employee.last_name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-500 font-mono">{employee.badge_id}</span>
              <StatusBadge status={employee.is_active ? "active" : "inactive"} />
              {totalBonus > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⭐ {totalBonus} pts</span>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={toggleActive} className="text-sm">
          {employee.is_active ? "Archive" : "Reactivate"}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal" className="space-y-4">
        <TabsList className="bg-gray-100 p-1 rounded-lg">
          <TabsTrigger value="personal" className="text-xs data-[state=active]:bg-white">Personal Info</TabsTrigger>
          <TabsTrigger value="work" className="text-xs data-[state=active]:bg-white">Work Info</TabsTrigger>
          <TabsTrigger value="bank" className="text-xs data-[state=active]:bg-white">Bank Details</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs data-[state=active]:bg-white">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <Card className="border-0 shadow-md">
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8">
              <InfoRow icon={Mail} label="Email" value={employee.email} />
              <InfoRow icon={Phone} label="Phone" value={employee.phone} />
              <InfoRow icon={Calendar} label="Date of Birth" value={employee.dob ? new Date(employee.dob).toLocaleDateString() : null} />
              <InfoRow icon={MapPin} label="Address" value={[employee.address, employee.city, employee.state].filter(Boolean).join(", ")} />
              <InfoRow icon={Calendar} label="Gender" value={employee.gender} />
              <InfoRow icon={Calendar} label="Marital Status" value={employee.marital_status} />
              <InfoRow icon={Calendar} label="Qualification" value={employee.qualification} />
              <InfoRow icon={Calendar} label="Experience" value={employee.experience} />
              <InfoRow icon={Phone} label="Emergency Contact" value={employee.emergency_contact ? `${employee.emergency_contact_name || ''} (${employee.emergency_contact_relation || ''}) — ${employee.emergency_contact}` : null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work">
          <Card className="border-0 shadow-md">
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8">
              <InfoRow icon={Briefcase} label="Job Role" value={workInfo.job_role} />
              <InfoRow icon={Building} label="Work Type" value={workInfo.work_type} />
              <InfoRow icon={Building} label="Employee Type" value={workInfo.employee_type} />
              <InfoRow icon={MapPin} label="Location" value={workInfo.location} />
              <InfoRow icon={Mail} label="Work Email" value={workInfo.work_email} />
              <InfoRow icon={Calendar} label="Joining Date" value={workInfo.joining_date ? new Date(workInfo.joining_date).toLocaleDateString() : null} />
              <InfoRow icon={CreditCard} label="Basic Salary" value={workInfo.basic_salary ? `₹${Number(workInfo.basic_salary).toLocaleString()}` : null} />
              <InfoRow icon={Calendar} label="Contract End" value={workInfo.contract_end_date ? new Date(workInfo.contract_end_date).toLocaleDateString() : null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank">
          <Card className="border-0 shadow-md">
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <InfoRow icon={CreditCard} label="Bank Name" value={bankDetails.bank_name} />
              <InfoRow icon={CreditCard} label="Account Number" value={bankDetails.account_number} />
              <InfoRow icon={Building} label="Branch" value={bankDetails.branch} />
              <InfoRow icon={CreditCard} label="IFSC Code" value={bankDetails.bank_code_1} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex gap-2 mb-4">
                <Textarea
                  placeholder="Add a note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="text-sm min-h-[60px]"
                />
                <Button onClick={handleAddNote} className="bg-[#E8604C] hover:bg-[#d04a38] shrink-0">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
